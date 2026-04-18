import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { NotificationBell } from "../components/notification-bell";
import { GlobalSidebar } from "../components/global-sidebar";
import { DashboardLayout } from "../components/dashboard-layout";
import {
  Home,
  Users,
  Package,
  TrendingUp,
  Utensils,
  Settings,
  Bell,
  User,
  LogOut,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  Leaf,
  Shield,
  Ban,
  Flag,
  TriangleAlert,
  Trash2,
  Menu,
  X
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";

type AdminTab = "overview" | "users" | "donations" | "analytics" | "settings";
type VerificationStatus = "pending" | "verified" | "rejected";

const normalizeVerificationStatus = (value: unknown): VerificationStatus => {
  if (value === "verified" || value === "rejected") {
    return value;
  }
  return "pending";
};

const getAutoVerificationStatus = (userRecord: any): VerificationStatus => {
  const role = typeof userRecord?.role === "string" ? userRecord.role : "";

  if (role === "donor" && Boolean(userRecord?.donorDigiLockerVerified)) {
    return "verified";
  }

  if (role === "volunteer" && Boolean(userRecord?.volunteerDigiLockerVerified)) {
    return "verified";
  }

  if (role === "receiver") {
    if (userRecord?.receiverType === "ngo") {
      if (Boolean(userRecord?.ngoDocumentVerified ?? userRecord?.ngoLinkedToApp)) {
        return "verified";
      }
    } else if (Boolean(userRecord?.receiverDigiLockerVerified)) {
      return "verified";
    }
  }

  return normalizeVerificationStatus(userRecord?.verificationStatus);
};

const getVerificationMethodLabel = (userRecord: any): string => {
  const role = typeof userRecord?.role === "string" ? userRecord.role : "";
  const providerRaw =
    role === "donor"
      ? userRecord?.donorVerificationProvider
      : role === "volunteer"
      ? userRecord?.volunteerVerificationProvider
      : role === "receiver" && userRecord?.receiverType === "ngo"
      ? userRecord?.ngoDocumentVerificationProvider
      : role === "receiver"
      ? userRecord?.receiverVerificationProvider
      : "";

  const provider = typeof providerRaw === "string" ? providerRaw.trim().toLowerCase() : "";
  if (!provider) {
    return "Not Available";
  }

  if (provider.includes("open-public")) {
    return "Open Public Checks";
  }
  if (provider.includes("digilocker")) {
    return "DigiLocker";
  }
  if (provider.includes("mock")) {
    return "Mock Verification";
  }
  if (provider.includes("ngo")) {
    return "NGO Document Check";
  }

  return providerRaw;
};

export function AdminDashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [donations, setDonations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [impactLedgerEntries, setImpactLedgerEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [actionLoadingUserId, setActionLoadingUserId] = useState<string | null>(null);
  const [expandedDonationId, setExpandedDonationId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [notifyOnFlags, setNotifyOnFlags] = useState(true);
  const [strictModeration, setStrictModeration] = useState(false);
  const [autoRefreshRealtime, setAutoRefreshRealtime] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("admin-dashboard-settings");
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as {
        notifyOnFlags?: boolean;
        strictModeration?: boolean;
        autoRefreshRealtime?: boolean;
      };
      setNotifyOnFlags(parsed.notifyOnFlags ?? true);
      setStrictModeration(parsed.strictModeration ?? false);
      setAutoRefreshRealtime(parsed.autoRefreshRealtime ?? true);
    } catch {
      // Keep defaults when corrupted.
    }
  }, []);

  useEffect(() => {
    const unsubDonations = onSnapshot(
      collection(db, "donations"),
      (snapshot) => {
        setDonations(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => setUsers(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))),
      () => undefined
    );

    const unsubImpactLedger = onSnapshot(
      collection(db, "impactLedger"),
      (snapshot) => {
        const entries = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .sort((a: any, b: any) => {
            const timeA = a.createdAt?.toDate?.().getTime() || 0;
            const timeB = b.createdAt?.toDate?.().getTime() || 0;
            return timeB - timeA;
          })
          .slice(0, 8);
        setImpactLedgerEntries(entries);
      },
      () => undefined
    );

    return () => {
      unsubDonations();
      unsubUsers();
      unsubImpactLedger();
    };
  }, []);

  const shortHash = (value: unknown) => {
    const raw = typeof value === "string" ? value : "";
    if (!raw) {
      return "-";
    }
    return `${raw.slice(0, 10)}...${raw.slice(-8)}`;
  };

  const analytics = useMemo(() => {
    const totalDonations = donations.length;
    const claimedDonations = donations.filter((donation) => donation.claimed).length;
    const completedDeliveries = donations.filter((donation) => donation.volunteerStatus === "completed").length;
    const availableDonations = totalDonations - claimedDonations;
    const mealsSaved = donations.reduce((sum, donation) => sum + (parseInt(donation.quantity, 10) || 0), 0);
    const successRate = totalDonations > 0 ? ((claimedDonations / totalDonations) * 100).toFixed(1) : "0";

    return {
      totalDonations,
      claimedDonations,
      completedDeliveries,
      availableDonations,
      mealsSaved,
      successRate,
    };
  }, [donations]);

  const userAnalytics = useMemo(() => {
    const donorCount = users.filter((userRecord) => userRecord.role === "donor").length;
    const receiverCount = users.filter((userRecord) => userRecord.role === "receiver").length;
    const volunteerCount = users.filter((userRecord) => userRecord.role === "volunteer").length;
    const adminCount = users.filter((userRecord) => userRecord.role === "admin").length;
    const flaggedCount = users.filter((userRecord) => Boolean(userRecord.adminFlagged)).length;
    const bannedCount = users.filter((userRecord) => Boolean(userRecord.banned)).length;

    return { donorCount, receiverCount, volunteerCount, adminCount, flaggedCount, bannedCount };
  }, [users]);

  const donationTrends = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: date.toLocaleString("en-US", { month: "short" }),
        donations: 0,
        claimed: 0,
        delivered: 0,
      };
    });

    const monthMap = new Map(months.map((month) => [month.key, month]));

    donations.forEach((donation) => {
      const createdDate = donation.createdAt?.toDate?.();
      if (!createdDate) {
        return;
      }

      const key = `${createdDate.getFullYear()}-${createdDate.getMonth()}`;
      const bucket = monthMap.get(key);
      if (!bucket) {
        return;
      }

      bucket.donations += 1;
      if (donation.claimed) {
        bucket.claimed += 1;
      }
      if (donation.volunteerStatus === "completed") {
        bucket.delivered += 1;
      }
    });

    return months;
  }, [donations]);

  const userDistribution = useMemo(() => {
    return [
      { name: "Donors", value: userAnalytics.donorCount, color: "#10b981" },
      { name: "Receivers", value: userAnalytics.receiverCount, color: "#3b82f6" },
      { name: "Volunteers", value: userAnalytics.volunteerCount, color: "#8b5cf6" },
      { name: "Admins", value: userAnalytics.adminCount, color: "#f97316" },
    ];
  }, [userAnalytics]);

  const userByUid = useMemo(() => {
    return new Map(
      users.map((userRecord) => {
        const uid = typeof userRecord.uid === "string" ? userRecord.uid : userRecord.id;
        return [uid, userRecord];
      })
    );
  }, [users]);

  const userByEmail = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((userRecord) => {
      if (typeof userRecord.email === "string") {
        map.set(userRecord.email.toLowerCase(), userRecord);
      }
    });
    return map;
  }, [users]);

  const getUserDisplayName = (record: any) => {
    if (!record) {
      return "Unknown";
    }

    const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
    const donorDisplayName = typeof record.donorDisplayName === "string" ? record.donorDisplayName.trim() : "";
    const restaurantName = typeof record.restaurantName === "string" ? record.restaurantName.trim() : "";
    const ngoName = typeof record.ngoName === "string" ? record.ngoName.trim() : "";

    return fullName || donorDisplayName || restaurantName || ngoName || record.email || "Unknown";
  };

  const getDonorLabel = (donation: any) => {
    const byUid = donation.donorUid ? userByUid.get(donation.donorUid) : null;
    const byEmail = donation.donorEmail ? userByEmail.get(String(donation.donorEmail).toLowerCase()) : null;

    if (typeof donation.donorDisplayName === "string" && donation.donorDisplayName.trim()) {
      return donation.donorDisplayName.trim();
    }
    if (byUid) {
      return getUserDisplayName(byUid);
    }
    if (byEmail) {
      return getUserDisplayName(byEmail);
    }

    return donation.donorEmail || donation.donorUid || "Unknown donor";
  };

  const getReceiverLabel = (donation: any) => {
    if (typeof donation.claimedByName === "string" && donation.claimedByName.trim()) {
      const label = donation.claimedByType === "ngo" ? "NGO" : "Person";
      return `${donation.claimedByName.trim()} (${label})`;
    }

    const byUid = donation.claimedByUid ? userByUid.get(donation.claimedByUid) : null;
    if (byUid) {
      const roleType = byUid.receiverType === "ngo" ? "NGO" : "Person";
      return `${getUserDisplayName(byUid)} (${roleType})`;
    }

    return donation.claimedBy || "Not claimed";
  };

  const managedUsers = useMemo(() => {
    const donorCounts = new Map<string, number>();
    const receiverCounts = new Map<string, number>();
    const volunteerCounts = new Map<string, number>();

    donations.forEach((donation) => {
      const donorEmail = (donation.donorEmail || "").toLowerCase();
      const receiverUid = donation.claimedByUid || "";
      const receiverEmail = (donation.claimedBy || "").toLowerCase();
      const volunteerUid = donation.volunteerUid || "";

      if (donorEmail) {
        donorCounts.set(donorEmail, (donorCounts.get(donorEmail) || 0) + 1);
      }
      if (receiverUid) {
        receiverCounts.set(receiverUid, (receiverCounts.get(receiverUid) || 0) + 1);
      } else if (receiverEmail) {
        receiverCounts.set(receiverEmail, (receiverCounts.get(receiverEmail) || 0) + 1);
      }
      if (volunteerUid && donation.volunteerStatus === "completed") {
        volunteerCounts.set(volunteerUid, (volunteerCounts.get(volunteerUid) || 0) + 1);
      }
    });

    return users.map((userRecord) => {
      const role = typeof userRecord.role === "string" ? userRecord.role : "user";
      const email = typeof userRecord.email === "string" ? userRecord.email : "-";
      const uid = typeof userRecord.uid === "string" ? userRecord.uid : userRecord.id;
      const verificationStatus = getAutoVerificationStatus(userRecord);
      return {
        id: userRecord.id,
        uid,
        name: getUserDisplayName(userRecord),
        email,
        role: role.charAt(0).toUpperCase() + role.slice(1),
        donations: donorCounts.get(email.toLowerCase()) || 0,
        claims: receiverCounts.get(uid) || receiverCounts.get(email.toLowerCase()) || 0,
        deliveries: volunteerCounts.get(uid) || 0,
        flagged: Boolean(userRecord.adminFlagged),
        banned: Boolean(userRecord.banned),
        warnings: Number(userRecord.adminWarningCount || 0),
        verificationStatus,
        verificationMethod: getVerificationMethodLabel(userRecord),
      };
    });
  }, [donations, users]);

  const verificationReviewRows = useMemo(() => {
    return users
      .filter((userRecord) => {
        const role = typeof userRecord.role === "string" ? userRecord.role : "";
        return role === "donor" || (role === "receiver" && userRecord.receiverType === "ngo");
      })
      .map((userRecord) => {
        const role = typeof userRecord.role === "string" ? userRecord.role : "user";
        const typeLabel = role === "donor" ? "Donor" : "NGO";

        return {
          id: userRecord.id,
          name: getUserDisplayName(userRecord),
          type: typeLabel,
          status: getAutoVerificationStatus(userRecord),
          verificationMethod: getVerificationMethodLabel(userRecord),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const latestDonations = useMemo(() => {
    return [...donations]
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.().getTime() || 0;
        const timeB = b.createdAt?.toDate?.().getTime() || 0;
        return timeB - timeA;
      })
      .slice(0, 6)
      .map((donation) => ({
        id: donation.id,
        foodName: donation.foodName || "Unknown Food",
        action: donation.claimed ? "Claimed by receiver" : "Donation listed",
        status: donation.claimed ? "success" : "pending",
        time: donation.createdAt?.toDate?.()?.toLocaleString() || "Recently",
      }));
  }, [donations]);

  const detailedDonations = useMemo(() => {
    return [...donations].sort((a, b) => {
      const timeA = a.createdAt?.toDate?.().getTime() || 0;
      const timeB = b.createdAt?.toDate?.().getTime() || 0;
      return timeB - timeA;
    });
  }, [donations]);

  const handleWarnUser = async (userId: string, currentWarnings: number) => {
    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await updateDoc(doc(db, "users", userId), {
        adminWarningCount: currentWarnings + 1,
        adminLastAction: "warned",
        adminLastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActionMessage("User warned successfully.");
    } catch {
      setActionMessage("Could not warn this user right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleFlagUser = async (userId: string) => {
    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await updateDoc(doc(db, "users", userId), {
        adminFlagged: true,
        adminLastAction: "flagged",
        adminLastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActionMessage("User flagged successfully.");
    } catch {
      setActionMessage("Could not flag this user right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    const confirmed = window.confirm("Ban this user? They will be marked as banned immediately.");
    if (!confirmed) {
      return;
    }

    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await updateDoc(doc(db, "users", userId), {
        banned: true,
        bannedAt: serverTimestamp(),
        adminLastAction: "banned",
        adminLastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActionMessage("User banned successfully.");
    } catch {
      setActionMessage("Could not ban this user right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmed = window.confirm("Delete this user profile from Firestore? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await deleteDoc(doc(db, "users", userId));
      setActionMessage("User profile deleted from database.");
    } catch {
      setActionMessage("Could not delete this user profile right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleApproveVerification = async (userId: string) => {
    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await updateDoc(doc(db, "users", userId), {
        verificationStatus: "verified",
        verificationReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActionMessage("Verification approved successfully.");
    } catch {
      setActionMessage("Could not approve verification right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleRejectVerification = async (userId: string) => {
    setActionLoadingUserId(userId);
    setActionMessage("");
    try {
      await updateDoc(doc(db, "users", userId), {
        verificationStatus: "rejected",
        verificationReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActionMessage("Verification rejected.");
    } catch {
      setActionMessage("Could not reject verification right now.");
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleSaveSettings = () => {
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      localStorage.setItem(
        "admin-dashboard-settings",
        JSON.stringify({
          notifyOnFlags,
          strictModeration,
          autoRefreshRealtime,
          updatedAt: Date.now(),
        })
      );
      setSettingsMessage("Settings saved successfully.");
    } catch {
      setSettingsMessage("Could not save settings. Please try again.");
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <>
      <GlobalSidebar role="admin" activeTab={activeTab} onTabChange={(tab: string) => setActiveTab(tab as any)} />
      <DashboardLayout>
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 lg:px-8 py-2 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-xs md:text-sm text-gray-600">Real-time control center for users, donations, and operations</p>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <NotificationBell audienceRole="admin" />
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="hidden md:block">
                  <div className="font-medium text-sm">Admin User</div>
                  <div className="text-xs text-gray-600">Administrator</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-4 gap-1 md:gap-6 mb-6 md:mb-8">
                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{loading ? "-" : analytics.totalDonations}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Donations</div>
                </Card>
                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{loading ? "-" : analytics.claimedDonations}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Claimed</div>
                </Card>
                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{loading ? "-" : analytics.completedDeliveries}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Completed</div>
                </Card>
                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{loading ? "-" : `${analytics.successRate}%`}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Success</div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <Card className="lg:col-span-2 p-8 rounded-3xl border-0 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Recent Activity</h2>
                    <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">Live</Badge>
                  </div>
                  <div className="space-y-4">
                    {latestDonations.length > 0 ? (
                      latestDonations.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50 transition-colors">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              activity.status === "success" ? "bg-[#d1fae5]" : "bg-[#dbeafe]"
                            }`}
                          >
                            {activity.status === "success" ? (
                              <CheckCircle2 className="w-5 h-5 text-[#047857]" />
                            ) : (
                              <Clock className="w-5 h-5 text-[#1d4ed8]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{activity.foodName}</div>
                            <div className="text-sm text-gray-600">{activity.action}</div>
                            <div className="text-xs text-gray-500 mt-1">{activity.time}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">No recent activities</div>
                    )}
                  </div>
                </Card>

                <Card className="p-8 rounded-3xl border-0 shadow-lg">
                  <h2 className="text-xl font-bold mb-6">Moderation Snapshot</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Flagged Users</span>
                      <Badge className="rounded-full bg-[#fef3c7] text-[#92400e]">{userAnalytics.flaggedCount}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Banned Users</span>
                      <Badge className="rounded-full bg-[#fee2e2] text-[#991b1b]">{userAnalytics.bannedCount}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Realtime Sync</span>
                      <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">
                        {autoRefreshRealtime ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="mt-6 p-8 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Impact Receipt Ledger</h2>
                  <Badge className="rounded-full bg-[#e0f2fe] text-[#0c4a6e]">{impactLedgerEntries.length} Recent</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-5">
                  Tamper-evident chain receipts created when a volunteer completes and verifies delivery proof.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Receipt</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Donation</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Sequence</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Hash</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Previous</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impactLedgerEntries.length > 0 ? impactLedgerEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 font-medium">{entry.receiptId || "-"}</td>
                          <td className="py-4 px-4 text-gray-600">{entry.payload?.foodName || entry.donationId || "-"}</td>
                          <td className="py-4 px-4 text-gray-600">{entry.sequence ?? "-"}</td>
                          <td className="py-4 px-4 text-xs text-gray-500">{shortHash(entry.hash)}</td>
                          <td className="py-4 px-4 text-xs text-gray-500">{shortHash(entry.previousHash)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-500">
                            No impact receipts yet. Complete a delivery to generate the first ledger entry.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeTab === "users" && (
            <Card className="p-8 rounded-3xl border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">User Management</h2>
                <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">{managedUsers.length} Users</Badge>
              </div>

              {actionMessage && <div className="mb-4 text-sm text-[#1d4ed8]">{actionMessage}</div>}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Role</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Activity</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedUsers.map((userRecord) => (
                      <tr key={userRecord.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 font-medium">{userRecord.name}</td>
                        <td className="py-4 px-4 text-gray-600">{userRecord.email}</td>
                        <td className="py-4 px-4">
                          <Badge variant="secondary" className="rounded-full">
                            {userRecord.role}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-gray-600">
                          {userRecord.role === "Donor" && `${userRecord.donations} donations`}
                          {userRecord.role === "Receiver" && `${userRecord.claims} claims`}
                          {userRecord.role === "Volunteer" && `${userRecord.deliveries} deliveries`}
                          {userRecord.role === "Admin" && "Platform management"}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap gap-2">
                            {userRecord.verificationStatus === "verified" && (
                              <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">Verified</Badge>
                            )}
                            {userRecord.verificationMethod !== "Not Available" && (
                              <Badge className="rounded-full bg-[#e0f2fe] text-[#0c4a6e]">
                                Method: {userRecord.verificationMethod}
                              </Badge>
                            )}
                            {userRecord.banned ? (
                              <Badge className="rounded-full bg-[#fee2e2] text-[#991b1b]">Banned</Badge>
                            ) : userRecord.flagged ? (
                              <Badge className="rounded-full bg-[#fef3c7] text-[#92400e]">Flagged</Badge>
                            ) : (
                              <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">Active</Badge>
                            )}
                            {userRecord.warnings > 0 && (
                              <Badge className="rounded-full bg-[#ffedd5] text-[#9a3412]">{userRecord.warnings} Warnings</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              disabled={actionLoadingUserId === userRecord.id}
                              onClick={() => handleWarnUser(userRecord.id, userRecord.warnings)}
                            >
                              <TriangleAlert className="w-4 h-4 mr-1" />
                              Warn
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              disabled={actionLoadingUserId === userRecord.id}
                              onClick={() => handleFlagUser(userRecord.id)}
                            >
                              <Flag className="w-4 h-4 mr-1" />
                              Flag
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              disabled={actionLoadingUserId === userRecord.id}
                              onClick={() => handleBanUser(userRecord.id)}
                            >
                              <Ban className="w-4 h-4 mr-1" />
                              Ban
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              disabled={actionLoadingUserId === userRecord.id}
                              onClick={() => handleDeleteUser(userRecord.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 rounded-3xl border border-[#e2e8f0] bg-gradient-to-br from-white to-[#f8fafc] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Trust Verification Review</h3>
                  <Badge className="rounded-full bg-[#e0e7ff] text-[#3730a3]">{verificationReviewRows.length} Reviews</Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Method</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationReviewRows.length > 0 ? verificationReviewRows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 font-medium">{row.name}</td>
                          <td className="py-4 px-4">
                            <Badge className="rounded-full bg-[#f1f5f9] text-[#334155]">{row.type}</Badge>
                          </td>
                          <td className="py-4 px-4">
                            <Badge
                              className={`rounded-full border-0 shadow-sm ${
                                row.status === "verified"
                                  ? "bg-gradient-to-r from-[#d1fae5] to-[#a7f3d0] text-[#047857]"
                                  : row.status === "rejected"
                                  ? "bg-gradient-to-r from-[#fee2e2] to-[#fecaca] text-[#991b1b]"
                                  : "bg-gradient-to-r from-[#e0e7ff] to-[#dbeafe] text-[#1d4ed8]"
                              }`}
                            >
                              {row.status === "verified" ? "Verified" : row.status === "rejected" ? "Rejected" : "Pending"}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <Badge className="rounded-full bg-[#e0f2fe] text-[#0c4a6e]">
                              {row.verificationMethod}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-2">
                              {row.status === "verified" ? (
                                <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">Auto Verified</Badge>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-full bg-[#10b981] hover:bg-[#047857]"
                                    disabled={actionLoadingUserId === row.id}
                                    onClick={() => handleApproveVerification(row.id)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full border-[#ef4444] text-[#b91c1c] hover:bg-[#fee2e2]"
                                    disabled={actionLoadingUserId === row.id}
                                    onClick={() => handleRejectVerification(row.id)}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-500">
                            No donor or NGO profiles available for verification review.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "donations" && (
            <div className="space-y-6">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Donation Management</h2>
                  <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">{detailedDonations.length} Records</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Real-time donation feed with donor, receiver, volunteer, and proof details.
                </p>
              </Card>

              {detailedDonations.map((donation) => {
                const isExpanded = expandedDonationId === donation.id;
                const claimedProofImages = Array.isArray(donation.claimedProofImages) ? donation.claimedProofImages : [];
                const deliveryProofImages = Array.isArray(donation.deliveryProofImages) ? donation.deliveryProofImages : [];

                return (
                  <Card key={donation.id} className="p-6 rounded-3xl border-0 shadow-lg">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{donation.foodName || "Donation"}</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          {donation.quantity || "-"} | {donation.foodType || "N/A"} | {donation.urgency || "normal"}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{donation.address || "Address not provided"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`rounded-full ${donation.claimed ? "bg-[#d1fae5] text-[#047857]" : "bg-[#ffedd5] text-[#9a3412]"}`}>
                          {donation.claimed ? "Claimed" : "Available"}
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => setExpandedDonationId(isExpanded ? null : donation.id)}
                        >
                          {isExpanded ? "Hide Details" : "View Full Details"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-5 grid lg:grid-cols-2 gap-4 text-sm">
                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                          <div><span className="font-semibold">Listed By:</span> {getDonorLabel(donation)}</div>
                          <div><span className="font-semibold">Donor Contact:</span> {donation.donorEmail || donation.donorPhone || "Not shared"}</div>
                          <div><span className="font-semibold">Listed At:</span> {donation.createdAt?.toDate?.()?.toLocaleString() || "N/A"}</div>
                          <div><span className="font-semibold">Expiry:</span> {donation.expiryTime ? new Date(donation.expiryTime).toLocaleString() : "N/A"}</div>
                        </div>

                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                          <div><span className="font-semibold">Accepted By:</span> {getReceiverLabel(donation)}</div>
                          <div><span className="font-semibold">Claimed At:</span> {donation.claimedAt?.toDate?.()?.toLocaleString() || "Not claimed"}</div>
                          <div><span className="font-semibold">Volunteer:</span> {donation.volunteerName || donation.volunteerUid || "Not assigned"}</div>
                          <div><span className="font-semibold">Delivery Status:</span> {donation.volunteerStatus || "Pending"}</div>
                        </div>

                        <div className="lg:col-span-2 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                          <div className="font-semibold mb-2">Receiver Claim Proof</div>
                          <div className="text-gray-600 mb-2">
                            {donation.claimedProofDescription || "No receiver proof description provided."}
                          </div>
                          {claimedProofImages.length > 0 ? (
                            <div className="grid md:grid-cols-4 gap-3">
                              {claimedProofImages.map((image: string, index: number) => (
                                <img
                                  key={`claimed-proof-${index}`}
                                  src={image}
                                  alt={`Receiver proof ${index + 1}`}
                                  className="w-full h-28 object-cover rounded-xl border border-gray-200"
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-500">No receiver proof images.</div>
                          )}
                        </div>

                        <div className="lg:col-span-2 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                          <div className="font-semibold mb-2">Volunteer Delivery Proof</div>
                          <div className="text-gray-600 mb-2">
                            {donation.deliveryProofDescription || "No volunteer proof description provided."}
                          </div>
                          {deliveryProofImages.length > 0 ? (
                            <div className="grid md:grid-cols-4 gap-3">
                              {deliveryProofImages.map((image: string, index: number) => (
                                <img
                                  key={`delivery-proof-${index}`}
                                  src={image}
                                  alt={`Delivery proof ${index + 1}`}
                                  className="w-full h-28 object-cover rounded-xl border border-gray-200"
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-500">No volunteer proof images.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-8">
              <div className="grid lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 p-8 rounded-3xl border-0 shadow-lg">
                  <h2 className="text-xl font-bold mb-6">Donation Trends</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={donationTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "none",
                          borderRadius: "16px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="donations" stroke="#10b981" strokeWidth={3} name="Donations" />
                      <Line type="monotone" dataKey="claimed" stroke="#3b82f6" strokeWidth={3} name="Claimed" />
                      <Line type="monotone" dataKey="delivered" stroke="#8b5cf6" strokeWidth={3} name="Delivered" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-8 rounded-3xl border-0 shadow-lg">
                  <h2 className="text-xl font-bold mb-6">User Distribution</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={userDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                        {userDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "none",
                          borderRadius: "16px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                <Card className="p-8 rounded-3xl border-0 shadow-lg">
                  <h2 className="text-xl font-bold mb-6">Claims vs Available</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={[
                        { label: "Available", value: analytics.availableDonations },
                        { label: "Claimed", value: analytics.claimedDonations },
                        { label: "Delivered", value: analytics.completedDeliveries },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-8 rounded-3xl border-0 shadow-lg">
                  <h2 className="text-xl font-bold mb-6">Meals Impact</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart
                      data={donationTrends.map((month) => ({
                        month: month.month,
                        meals: month.donations * 10,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="meals" stroke="#3b82f6" fill="#bfdbfe" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Admin Settings</h2>
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div>
                      <div className="font-semibold">Notify on flagged users</div>
                      <div className="text-sm text-gray-600">Show immediate moderation alerts when users are flagged.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyOnFlags}
                      onChange={(event) => setNotifyOnFlags(event.target.checked)}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div>
                      <div className="font-semibold">Strict moderation mode</div>
                      <div className="text-sm text-gray-600">Highlight risky activity and prioritize flagged profiles.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={strictModeration}
                      onChange={(event) => setStrictModeration(event.target.checked)}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div>
                      <div className="font-semibold">Realtime auto-refresh indicator</div>
                      <div className="text-sm text-gray-600">Display realtime sync state and live counters.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoRefreshRealtime}
                      onChange={(event) => setAutoRefreshRealtime(event.target.checked)}
                    />
                  </label>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <Button
                    type="button"
                    className="rounded-full bg-[#10b981] hover:bg-[#047857]"
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                  >
                    {settingsSaving ? "Saving..." : "Save Settings"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setNotifyOnFlags(true);
                      setStrictModeration(false);
                      setAutoRefreshRealtime(true);
                      setSettingsMessage("Settings reset locally. Click Save Settings to persist.");
                    }}
                  >
                    Reset
                  </Button>
                </div>

                {settingsMessage && <div className="mt-4 text-sm text-[#1d4ed8]">{settingsMessage}</div>}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">System Health</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Realtime Firestore</span>
                    <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Moderation Pipeline</span>
                    <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">
                      <Shield className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Background Sync</span>
                    <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                      {autoRefreshRealtime ? "Live" : "Manual"}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>
      </DashboardLayout>
    </>
  );
}
