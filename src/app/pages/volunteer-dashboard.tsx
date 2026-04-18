import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { NotificationBell } from "../components/notification-bell";
import { GlobalSidebar } from "../components/global-sidebar";
import { DashboardLayout } from "../components/dashboard-layout";
import { 
  Home, 
  MapPin, 
  Clock, 
  Utensils,
  Bell,
  User,
  LogOut,
  CheckCircle2,
  Navigation,
  Package,
  Award,
  TrendingUp,
  Route,
  Phone,
  Settings,
  Menu,
  X
} from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { sendNotification } from "../lib/notifications";
import { verifyIndianGovernmentIdentity } from "../lib/india-verification";
import { buildImpactLedgerPayload, createImpactLedgerHash } from "../lib/impact-ledger";

type TaskStatus = "pending" | "active" | "completed";

type PickupTask = {
  id: string;
  foodName: string;
  quantity: string;
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  deliveryAddress: string;
  distance: string;
  estimatedTime: string;
  urgency: "high" | "medium" | "low";
  donorPhone: string;
  donorUid?: string;
  claimedByUid?: string;
  receiverPhone: string;
  status: TaskStatus;
  acceptedAt?: { toDate?: () => Date };
  completedAt?: { toDate?: () => Date };
  donationId: string;
};

export function VolunteerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"available" | "active" | "completed" | "profile">("available");
  const [tasks, setTasks] = useState<PickupTask[]>([]);
  const [volunteerName, setVolunteerName] = useState("Volunteer");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [isRoleSwitching, setIsRoleSwitching] = useState(false);
  const [roleSwitchMessage, setRoleSwitchMessage] = useState("");
  const [verificationGovernmentId, setVerificationGovernmentId] = useState("");
  const [verificationProvider, setVerificationProvider] = useState("");
  const [verificationIdProofImage, setVerificationIdProofImage] = useState("");
  const [verificationDigiLockerVerified, setVerificationDigiLockerVerified] = useState(false);
  const [verificationNgoLinked, setVerificationNgoLinked] = useState(false);
  const [verificationNgoReference, setVerificationNgoReference] = useState("");
  const [verificationActionLoading, setVerificationActionLoading] = useState(false);
  const [completionTask, setCompletionTask] = useState<PickupTask | null>(null);
  const [completionProofDescription, setCompletionProofDescription] = useState("");
  const [completionProofImages, setCompletionProofImages] = useState<string[]>([]);
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const tab = query.get("tab");
    const requestedVerification = query.get("verification") === "1";

    if (requestedVerification || tab === "profile") {
      setActiveTab("profile");
      if (requestedVerification) {
        setSettingsMessage("Please complete your volunteer verification first.");
      }
      return;
    }

    if (tab === "available" || tab === "active" || tab === "completed" || tab === "profile") {
      setActiveTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("volunteer-theme");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    localStorage.setItem("volunteer-theme", themeMode);
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "donations"),
      (snapshot) => {
        const allTasks = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as any;
            if (!data.claimed) {
              return null;
            }

            const isMine = data.volunteerUid ? data.volunteerUid === auth.currentUser?.uid : true;
            if (!isMine) {
              return null;
            }

            const status = (data.volunteerStatus as TaskStatus | undefined) || "pending";
            return {
              id: docSnapshot.id,
              donationId: docSnapshot.id,
              foodName: data.foodName || "Donation",
              quantity: data.quantity || "-",
              pickupAddress: data.address || "Pickup address not provided",
              pickupLatitude: data.pickupLatitude,
              pickupLongitude: data.pickupLongitude,
              deliveryAddress: data.receiverAddress || data.claimedBy || "Receiver location",
              distance: data.routeDistance || "N/A",
              estimatedTime: data.estimatedTime || "N/A",
              urgency: (data.urgency as "high" | "medium" | "low") || "medium",
              donorPhone: data.donorPhone || "Not shared",
              donorUid: data.donorUid,
              claimedByUid: data.claimedByUid,
              receiverPhone: data.receiverPhone || "Not shared",
              status,
              acceptedAt: data.volunteerAcceptedAt,
              completedAt: data.deliveredAt,
            } as PickupTask;
          })
          .filter((task): task is PickupTask => Boolean(task));

        setTasks(allTasks);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) {
        setVolunteerName("Volunteer");
        return;
      }

      const fallback = user.displayName?.trim() || user.email?.split("@")[0] || "Volunteer";
      setVolunteerName(fallback);

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          return;
        }

        const data = userDoc.data();
        const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
        const photo = typeof data.photoURL === "string" ? data.photoURL : "";
        const phone = typeof data.phoneNumber === "string" ? data.phoneNumber : "";
        const volunteerPhone = typeof data.volunteerPhoneNumber === "string" ? data.volunteerPhoneNumber : "";
        const governmentId =
          typeof data.volunteerGovernmentId === "string"
            ? data.volunteerGovernmentId
            : typeof data.receiverGovernmentId === "string"
            ? data.receiverGovernmentId
            : typeof data.governmentId === "string"
            ? data.governmentId
            : "";
        const provider =
          typeof data.volunteerVerificationProvider === "string"
            ? data.volunteerVerificationProvider
            : typeof data.receiverVerificationProvider === "string"
            ? data.receiverVerificationProvider
            : "";
        const idProofImage =
          typeof data.volunteerIdProofImage === "string"
            ? data.volunteerIdProofImage
            : typeof data.receiverIdProofImage === "string"
            ? data.receiverIdProofImage
            : "";
        const digiLockerVerified =
          typeof data.volunteerDigiLockerVerified === "boolean"
            ? data.volunteerDigiLockerVerified
            : Boolean(data.receiverDigiLockerVerified);
        const ngoLinked =
          typeof data.volunteerNgoLinkedToApp === "boolean"
            ? data.volunteerNgoLinkedToApp
            : Boolean(data.ngoLinkedToApp);
        const ngoReference =
          typeof data.volunteerNgoLinkReference === "string"
            ? data.volunteerNgoLinkReference
            : typeof data.ngoLinkReference === "string"
            ? data.ngoLinkReference
            : "";

        if (fullName) {
          setVolunteerName(fullName);
        }
        setProfilePhotoUrl(photo);
        setPhoneNumber(phone || volunteerPhone);
        setVerificationGovernmentId(governmentId);
        setVerificationProvider(provider);
        setVerificationIdProofImage(idProofImage);
        setVerificationDigiLockerVerified(digiLockerVerified);
        setVerificationNgoLinked(ngoLinked);
        setVerificationNgoReference(ngoReference);
      } catch {
        // Keep fallback values.
      }
    };

    loadProfile();
  }, []);

  const availableTasks = useMemo(() => tasks.filter((task) => task.status === "pending"), [tasks]);
  const activeTasks = useMemo(() => tasks.filter((task) => task.status === "active"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "completed"), [tasks]);
  
  const renderSidebarNav = (closeMenu?: () => void) => (
    <nav className="flex-1 space-y-2">
      <button
        onClick={() => {
          setActiveTab("available");
          closeMenu?.();
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
          activeTab === "available"
            ? "bg-[#10b981] text-white"
            : themeMode === "dark"
            ? "text-slate-200 hover:bg-slate-800"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <Home className="w-5 h-5" />
        <span>Available Tasks</span>
      </button>
      <button
        onClick={() => {
          setActiveTab("active");
          closeMenu?.();
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
          activeTab === "active"
            ? "bg-[#10b981] text-white"
            : themeMode === "dark"
            ? "text-slate-200 hover:bg-slate-800"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <Package className="w-5 h-5" />
        <span>Active Deliveries</span>
      </button>
      <button
        onClick={() => {
          setActiveTab("completed");
          closeMenu?.();
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
          activeTab === "completed"
            ? "bg-[#10b981] text-white"
            : themeMode === "dark"
            ? "text-slate-200 hover:bg-slate-800"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <CheckCircle2 className="w-5 h-5" />
        <span>Completed</span>
      </button>
      <button
        onClick={() => {
          setActiveTab("profile");
          closeMenu?.();
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
          activeTab === "profile"
            ? "bg-[#10b981] text-white"
            : themeMode === "dark"
            ? "text-slate-200 hover:bg-slate-800"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <Settings className="w-5 h-5" />
        <span>Profile</span>
      </button>
    </nav>
  );
  const combinedCompletedDeliveries = useMemo(() => {
    return completedTasks.map((task) => ({
      id: `task-${task.id}`,
      foodName: task.foodName,
      date: task.completedAt?.toDate?.()?.toLocaleDateString() || "Today",
      time: task.completedAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "Now",
      distance: task.distance,
      earnings: task.distance !== "N/A" ? `$${Math.max(8, Math.round((parseFloat(task.distance) || 2) * 4))}` : "$8",
    }));
  }, [completedTasks]);

  const totalDeliveries = useMemo(() => completedTasks.length, [completedTasks]);
  const totalDistance = useMemo(() => {
    const parsedDynamic = completedTasks.reduce((sum, item) => sum + (parseFloat(item.distance) || 0), 0);
    return `${Math.round(parsedDynamic)} km`;
  }, [completedTasks]);
  const volunteerRating = useMemo(() => (totalDeliveries > 0 ? 4.9 : 0), [totalDeliveries]);

  const achievements = useMemo(() => {
    return [
      { id: "first", title: "First Mile", threshold: 1, description: "Complete first delivery" },
      { id: "steady", title: "Reliable Runner", threshold: 10, description: "Complete 10 deliveries" },
      { id: "champ", title: "Rescue Champion", threshold: 25, description: "Complete 25 deliveries" },
      { id: "hero", title: "Community Hero", threshold: 50, description: "Complete 50 deliveries" },
    ];
  }, []);

  const unlockedAchievements = useMemo(
    () => achievements.filter((item) => totalDeliveries >= item.threshold).length,
    [achievements, totalDeliveries]
  );

  const handleAcceptTask = async (taskId: string) => {
    const user = auth.currentUser;
    if (!user) {
      return;
    }
    const selectedTask = tasks.find((task) => task.id === taskId);
    await updateDoc(doc(db, "donations", taskId), {
      volunteerStatus: "active",
      volunteerUid: user.uid,
      volunteerName,
      volunteerAcceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (selectedTask) {
      await Promise.all([
        selectedTask.donorUid
          ? sendNotification({
              recipientUid: selectedTask.donorUid,
              title: "Volunteer accepted task",
              message: `${volunteerName} accepted ${selectedTask.foodName} for delivery.`,
              source: "volunteer-dashboard",
              link: "/donor",
            })
          : sendNotification({
              recipientRole: "donor",
              title: "Volunteer accepted task",
              message: `${volunteerName} accepted ${selectedTask.foodName} for delivery.`,
              source: "volunteer-dashboard",
              link: "/donor",
            }),
        sendNotification({
          recipientRole: "admin",
          title: "Volunteer task accepted",
          message: `${volunteerName} accepted ${selectedTask.foodName}.`,
          source: "volunteer-dashboard",
          link: "/admin",
        }),
      ]);
    }
  };

  const handleCompletionProofFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files).slice(0, 6);
    const encodedImages = await Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(new Error("delivery-proof-read-failed"));
            reader.readAsDataURL(file);
          })
      )
    );

    const validImages = encodedImages.filter((item) => item.startsWith("data:image/"));
    setCompletionProofImages((prev) => [...prev, ...validImages].slice(0, 6));
    event.target.value = "";
  };

  const handleCompleteTask = async () => {
    if (!completionTask) {
      setCompletionMessage("No active delivery selected.");
      return;
    }

    if (!completionProofDescription.trim()) {
      setCompletionMessage("Please add a delivery proof description.");
      return;
    }

    if (completionProofImages.length === 0) {
      setCompletionMessage("Please upload at least one delivery proof image.");
      return;
    }

    setCompletionSubmitting(true);
    setCompletionMessage("");
    try {
      await updateDoc(doc(db, "donations", completionTask.id), {
        volunteerStatus: "completed",
        deliveredAt: serverTimestamp(),
        deliveryProofImages: completionProofImages,
        deliveryProofDescription: completionProofDescription.trim(),
        deliveryProofVerified: true,
        deliveryProofVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const latestReceiptSnapshot = await getDocs(
        query(collection(db, "impactLedger"), orderBy("sequence", "desc"), limit(1))
      );
      const latestReceipt = latestReceiptSnapshot.docs[0]?.data() as { sequence?: number; hash?: string } | undefined;
      const previousHash = typeof latestReceipt?.hash === "string" ? latestReceipt.hash : "GENESIS";
      const sequence = typeof latestReceipt?.sequence === "number" ? latestReceipt.sequence + 1 : 1;

      const impactPayload = buildImpactLedgerPayload({
        donationId: completionTask.id,
        foodName: completionTask.foodName || "Donation",
        quantityRaw: completionTask.quantity || "1",
        donorUid: completionTask.donorUid,
        receiverUid: completionTask.claimedByUid,
        volunteerUid: auth.currentUser?.uid || undefined,
        volunteerName,
        pickupAddress: completionTask.pickupAddress,
        deliveryAddress: completionTask.deliveryAddress,
        proofDescription: completionProofDescription,
        proofImageCount: completionProofImages.length,
        deliveredAtIso: new Date().toISOString(),
      });

      const receiptHash = await createImpactLedgerHash({
        payload: impactPayload,
        previousHash,
        sequence,
      });

      const receiptId = `IR-${sequence}-${receiptHash.slice(0, 12).toUpperCase()}`;
      await addDoc(collection(db, "impactLedger"), {
        receiptId,
        donationId: completionTask.id,
        sequence,
        previousHash,
        hash: receiptHash,
        payload: impactPayload,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "donations", completionTask.id), {
        impactReceiptId: receiptId,
        impactReceiptHash: receiptHash,
        impactReceiptSequence: sequence,
        updatedAt: serverTimestamp(),
      });

      await Promise.all([
        completionTask.donorUid
          ? sendNotification({
              recipientUid: completionTask.donorUid,
              title: "Delivery completed",
              message: `${volunteerName} completed delivery for ${completionTask.foodName}.`,
              source: "volunteer-dashboard",
              link: "/donor",
            })
          : sendNotification({
              recipientRole: "donor",
              title: "Delivery completed",
              message: `${volunteerName} completed delivery for ${completionTask.foodName}.`,
              source: "volunteer-dashboard",
              link: "/donor",
            }),
        sendNotification({
          recipientRole: "admin",
          title: "Delivery proof verified",
          message: `${volunteerName} submitted proof for ${completionTask.foodName}.`,
          source: "volunteer-dashboard",
          link: "/admin",
        }),
      ]);

      setCompletionMessage("Delivery completed and proof verified successfully.");
      setCompletionTask(null);
      setCompletionProofDescription("");
      setCompletionProofImages([]);
    } catch {
      setCompletionMessage("Unable to submit proof right now. Please try again.");
    } finally {
      setCompletionSubmitting(false);
    }
  };

  const handleOpenGoogleMaps = (task: PickupTask) => {
    if (typeof task.pickupLatitude === "number" && typeof task.pickupLongitude === "number") {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${task.pickupLatitude},${task.pickupLongitude}`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const destination = encodeURIComponent(task.pickupAddress || "Pickup location");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${destination}`;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  };

  const handleOpenCompletionProof = (task: PickupTask) => {
    setCompletionTask(task);
    setCompletionProofDescription("");
    setCompletionProofImages([]);
    setCompletionMessage("");
  };

  const handleSaveProfileSettings = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSettingsMessage("Please sign in again to update profile settings.");
      return;
    }

    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const nextPhotoUrl = profilePhotoUrl.trim();
      const nextPhone = phoneNumber.trim();

      await setDoc(
        doc(db, "users", user.uid),
        {
          photoURL: nextPhotoUrl,
          phoneNumber: nextPhone,
          volunteerPhoneNumber: nextPhone,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateProfile(user, {
        photoURL: nextPhotoUrl || null,
      });

      setSettingsMessage("Profile settings updated successfully.");
    } catch {
      setSettingsMessage("Could not update profile settings. Please try again.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      setSettingsMessage("No account email found. Please sign in again.");
      return;
    }

    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      await sendPasswordResetEmail(auth, userEmail);
      setSettingsMessage("Password reset link sent to your email.");
    } catch {
      setSettingsMessage("Unable to send reset link right now. Please try again.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleVerifyVolunteerIdentity = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSettingsMessage("Please sign in again to verify Aadhaar.");
      return;
    }

    if (!verificationGovernmentId.trim()) {
      setSettingsMessage("Please enter Aadhaar/government ID before verification.");
      return;
    }

    setVerificationActionLoading(true);
    setSettingsMessage("");
    try {
      const verificationResult = await verifyIndianGovernmentIdentity({
        governmentId: verificationGovernmentId.trim(),
        fullName: volunteerName,
        ngoName: "",
        ngoWebsite: "",
      });

      await setDoc(
        doc(db, "users", user.uid),
        {
          volunteerGovernmentId: verificationGovernmentId.trim(),
          volunteerDigiLockerVerified: verificationResult.isVerified,
          volunteerVerificationProvider: verificationResult.provider || "digilocker",
          volunteerVerificationProviderRef: verificationResult.providerReferenceId || null,
          volunteerVerificationReason: verificationResult.reason || null,
          volunteerVerificationRaw: verificationResult.raw || null,
          verificationStatus: verificationResult.isVerified ? "verified" : "pending",
          volunteerVerifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setVerificationProvider(verificationResult.provider || "digilocker");
      setVerificationDigiLockerVerified(verificationResult.isVerified);
      setSettingsMessage(
        verificationResult.isVerified
          ? "Volunteer Aadhaar verified through DigiLocker."
          : verificationResult.reason || "Verification submitted. Current status is pending review."
      );
    } catch {
      setSettingsMessage("Could not verify volunteer Aadhaar right now. Please try again.");
    } finally {
      setVerificationActionLoading(false);
    }
  };

  const handleSwitchToDonor = async () => {
    const user = auth.currentUser;
    if (!user) {
      setRoleSwitchMessage("Please sign in again to update your role.");
      return;
    }

    const confirmed = window.confirm(
      "Switch your profile from volunteer to donor? You can continue your volunteer work history from account records."
    );
    if (!confirmed) {
      return;
    }

    setIsRoleSwitching(true);
    setRoleSwitchMessage("");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          role: "donor",
          roleSwitchedFrom: "volunteer",
          roleSwitchedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setRoleSwitchMessage("Profile updated to donor. Redirecting...");
      navigate("/donor");
    } catch {
      setRoleSwitchMessage("Could not switch role right now. Please try again.");
    } finally {
      setIsRoleSwitching(false);
    }
  };

  return (
    <>
      <GlobalSidebar role="volunteer" activeTab={activeTab} onTabChange={(tab: string) => setActiveTab(tab as any)} />
      <DashboardLayout>
        {/* Top Bar */}
        <header className={`border-b px-4 md:px-6 lg:px-8 py-2 md:py-4 ${themeMode === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold">Volunteer Dashboard</h1>
              <p className="text-xs md:text-sm text-gray-600">Welcome back, {volunteerName}</p>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <NotificationBell audienceRole="volunteer" />
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] flex items-center justify-center overflow-hidden">
                  {profilePhotoUrl ? <img src={profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-white" />}
                </div>
                <div className="hidden md:block">
                  <div className="font-medium text-sm">{volunteerName}</div>
                  <div className="text-xs text-gray-600">Volunteer</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {(activeTab === "available" || activeTab === "active" || activeTab === "completed") && (
          <>
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-1 md:gap-6 mb-6 md:mb-8">
            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#d1fae5] flex items-center justify-center mb-1 md:mb-0">
                  <CheckCircle2 className="w-4 h-4 md:w-6 md:h-6 text-[#047857]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{totalDeliveries}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Deliveries</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#dbeafe] flex items-center justify-center mb-1 md:mb-0">
                  <Route className="w-4 h-4 md:w-6 md:h-6 text-[#1d4ed8]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{totalDistance}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Distance</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#fed7aa] flex items-center justify-center mb-1 md:mb-0">
                  <Package className="w-4 h-4 md:w-6 md:h-6 text-[#c2410c]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{activeTasks.length}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Active</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#e9d5ff] flex items-center justify-center mb-1 md:mb-0">
                  <Award className="w-4 h-4 md:w-6 md:h-6 text-[#6d28d9]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{volunteerRating}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Rating</div>
            </Card>
          </div>
          </>
          )}

          {activeTab === "available" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Left Column - Pickup Requests */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-8 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Available Pickup Requests</h2>
                  <Badge className="bg-[#fed7aa] text-[#c2410c] rounded-full px-4 py-2">
                    {availableTasks.length} New
                  </Badge>
                </div>

                <div className="space-y-4">
                  {availableTasks.length > 0 ? availableTasks.map((request) => (
                    <Card
                      key={request.id}
                      className={`p-6 rounded-3xl border-2 transition-all hover:shadow-lg ${
                        request.urgency === "high" ? "border-[#f97316]" : "border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-bold text-lg">{request.foodName}</h3>
                            {request.urgency === "high" && (
                              <Badge className="bg-[#f97316] text-white rounded-full">
                                Urgent
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-600">{request.quantity}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-[#10b981] mb-1">
                            {request.distance}
                          </div>
                          <div className="text-sm text-gray-600">Distance</div>
                        </div>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
                          <MapPin className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium">Pickup</div>
                            <div className="text-sm text-gray-600">{request.pickupAddress}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{request.donorPhone}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
                          <MapPin className="w-5 h-5 text-[#3b82f6] flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium">Delivery</div>
                            <div className="text-sm text-gray-600">{request.deliveryAddress}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{request.receiverPhone}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mb-4 p-3 bg-[#d1fae5] rounded-2xl">
                        <Clock className="w-5 h-5 text-[#047857]" />
                        <div>
                          <div className="text-sm font-medium text-[#047857]">
                            Estimated Time: {request.estimatedTime}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button onClick={() => handleAcceptTask(request.id)} className="flex-1 rounded-full bg-[#10b981] hover:bg-[#047857]">
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Accept Task
                        </Button>
                        <Button variant="outline" className="rounded-full px-6">
                          <Navigation className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  )) : (
                    <div className="text-center text-gray-500 py-8">No available tasks right now</div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right Column - Route Map & Completed Deliveries */}
            <div className="space-y-6">
              {/* Route Map */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Route Map</h3>
                <div className="bg-gradient-to-br from-[#d1fae5] to-[#dbeafe] rounded-2xl h-64 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    <svg className="w-full h-full">
                      <line x1="30%" y1="40%" x2="70%" y2="60%" stroke="#10b981" strokeWidth="3" strokeDasharray="5,5" />
                    </svg>
                    <div className="absolute top-2/5 left-[30%] w-4 h-4 bg-[#10b981] rounded-full border-4 border-white"></div>
                    <div className="absolute top-3/5 left-[70%] w-4 h-4 bg-[#3b82f6] rounded-full border-4 border-white"></div>
                  </div>
                  <div className="text-center z-10">
                    <Navigation className="w-12 h-12 text-[#10b981] mx-auto mb-2" />
                    <p className="font-medium text-gray-700">Live Navigation</p>
                    <p className="text-sm text-gray-600">GPS tracking enabled</p>
                  </div>
                </div>
                <Button className="w-full mt-4 rounded-full bg-[#3b82f6] hover:bg-[#1d4ed8]">
                  <Navigation className="w-4 h-4 mr-2" />
                  Start Navigation
                </Button>
              </Card>

              {/* ETA Cards */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Current ETA</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#d1fae5] rounded-2xl">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#047857]" />
                      <span className="text-sm font-medium">Pickup</span>
                    </div>
                    <span className="text-sm font-bold text-[#047857]">8 min</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#dbeafe] rounded-2xl">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#1d4ed8]" />
                      <span className="text-sm font-medium">Delivery</span>
                    </div>
                    <span className="text-sm font-bold text-[#1d4ed8]">23 min</span>
                  </div>
                </div>
              </Card>

              {/* Completed Deliveries */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Recent Completions</h3>
                <div className="space-y-3">
                  {combinedCompletedDeliveries.slice(0, 5).map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex items-start gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#d1fae5] flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-[#047857]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{delivery.foodName}</div>
                        <div className="text-xs text-gray-600">{delivery.date} • {delivery.time}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {delivery.distance} • {delivery.earnings}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4 rounded-full">
                  View All History
                </Button>
              </Card>

              {/* Achievements */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold">Top Volunteer</div>
                    <div className="text-sm opacity-90">This month</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="opacity-90">Rank</span>
                    <span className="font-semibold">#3 / 180</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-90">Points</span>
                    <span className="font-semibold">{totalDeliveries * 15}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
          )}

          {activeTab === "active" && (
            <Card className="p-8 rounded-3xl border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Active Deliveries</h2>
                <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">{activeTasks.length} Active</Badge>
              </div>
              <div className="space-y-4">
                {activeTasks.length > 0 ? activeTasks.map((task) => (
                  <Card key={task.id} className="p-6 rounded-3xl border border-blue-100">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{task.foodName}</h3>
                        <p className="text-sm text-gray-600">{task.quantity}</p>
                      </div>
                      <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">On Route</Badge>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div>Pickup: {task.pickupAddress}</div>
                      <div>Delivery: {task.deliveryAddress}</div>
                      <div>ETA: {task.estimatedTime}</div>
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" onClick={() => handleOpenCompletionProof(task)} className="rounded-full bg-[#10b981] hover:bg-[#047857]">
                        Mark Completed
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOpenGoogleMaps(task)}>
                        <Navigation className="w-4 h-4 mr-2" />
                        Navigate
                      </Button>
                    </div>
                  </Card>
                )) : (
                  <div className="text-center text-gray-500 py-10">No active deliveries yet</div>
                )}
              </div>

              {!completionTask && completionMessage && (
                <p className="mt-4 text-sm text-[#1d4ed8]">{completionMessage}</p>
              )}
            </Card>
          )}

          {completionTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">Delivery Proof Verification</h3>
                    <p className="text-sm text-gray-600">
                      Complete proof for <span className="font-medium">{completionTask.foodName}</span> before marking this task completed.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={completionSubmitting}
                    onClick={() => {
                      setCompletionTask(null);
                      setCompletionProofDescription("");
                      setCompletionProofImages([]);
                      setCompletionMessage("Proof submission canceled.");
                    }}
                  >
                    Close
                  </Button>
                </div>

                <div>
                  <Label htmlFor="deliveryProofDescription">Proof Description</Label>
                  <Textarea
                    id="deliveryProofDescription"
                    className="mt-2 rounded-2xl min-h-[110px]"
                    placeholder="Describe drop-off details and receiver handover confirmation..."
                    value={completionProofDescription}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setCompletionProofDescription(event.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="deliveryProofImages">Upload Photo Proof</Label>
                  <Input
                    id="deliveryProofImages"
                    type="file"
                    accept="image/*"
                    multiple
                    className="mt-2 rounded-2xl"
                    onChange={handleCompletionProofFilesSelected}
                  />
                  <p className="text-xs text-gray-500 mt-2">Upload up to 6 images.</p>
                </div>

                {completionProofImages.length > 0 && (
                  <div className="grid md:grid-cols-3 gap-3">
                    {completionProofImages.map((image, index) => (
                      <div key={`${index}-${image.slice(0, 24)}`} className="rounded-2xl overflow-hidden border border-gray-200">
                        <img src={image} alt={`Delivery proof ${index + 1}`} className="w-full h-32 object-cover" />
                        <div className="p-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full"
                            onClick={() => setCompletionProofImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="rounded-full bg-[#10b981] hover:bg-[#047857]"
                    disabled={completionSubmitting}
                    onClick={handleCompleteTask}
                  >
                    {completionSubmitting ? "Submitting..." : "Verify Proof & Complete"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={completionSubmitting}
                    onClick={() => {
                      setCompletionTask(null);
                      setCompletionProofDescription("");
                      setCompletionProofImages([]);
                      setCompletionMessage("Proof submission canceled.");
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {completionMessage && <p className="text-sm text-[#1d4ed8]">{completionMessage}</p>}
              </div>
            </div>
          )}

          {activeTab === "completed" && (
            <Card className="p-8 rounded-3xl border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Completed Deliveries</h2>
                <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">{combinedCompletedDeliveries.length} Total</Badge>
              </div>
              <div className="space-y-3">
                {combinedCompletedDeliveries.map((delivery) => (
                  <div key={delivery.id} className="p-4 rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{delivery.foodName}</div>
                      <div className="text-sm text-gray-600">{delivery.date} at {delivery.time}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">{delivery.distance}</div>
                      <div className="font-semibold text-[#047857]">{delivery.earnings}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "profile" && (
            <div className="space-y-6 max-w-4xl">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">User Profile</h2>
                <div className="grid md:grid-cols-3 gap-6 items-start">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] flex items-center justify-center overflow-hidden">
                      {profilePhotoUrl ? <img src={profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-white" />}
                    </div>
                    <div className="text-sm text-gray-600">Profile Photo Preview</div>
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <Label htmlFor="profilePhoto">Profile Photo URL</Label>
                      <Input id="profilePhoto" placeholder="https://example.com/photo.jpg" className="mt-2 rounded-2xl" value={profilePhotoUrl} onChange={(event) => setProfilePhotoUrl(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input id="phoneNumber" placeholder="+91 9876543210" className="mt-2 rounded-2xl" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
                    </div>
                    <Button onClick={handleSaveProfileSettings} className="rounded-full bg-[#10b981] hover:bg-[#047857]" disabled={settingsSaving}>
                      {settingsSaving ? "Saving..." : "Save Profile"}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Appearance</h2>
                <div className="flex items-center gap-3">
                  <Button type="button" variant={themeMode === "light" ? "default" : "outline"} className={`rounded-full ${themeMode === "light" ? "bg-[#10b981] hover:bg-[#047857]" : ""}`} onClick={() => setThemeMode("light")}>
                    Light Mode
                  </Button>
                  <Button type="button" variant={themeMode === "dark" ? "default" : "outline"} className={`rounded-full ${themeMode === "dark" ? "bg-[#0f172a] hover:bg-[#020617] text-white" : ""}`} onClick={() => setThemeMode("dark")}>
                    Dark Mode
                  </Button>
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Security</h2>
                <p className="text-gray-600 mb-4">Send a reset link to your registered email address.</p>
                <Button onClick={handleResetPassword} variant="outline" className="rounded-full" disabled={settingsSaving}>
                  Reset Password
                </Button>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-2">Profile Role</h2>
                <p className="text-gray-600 mb-4">
                  Want to post and manage food donations directly? Switch your profile from volunteer to donor.
                </p>
                <Button
                  onClick={handleSwitchToDonor}
                  className="rounded-full bg-[#f59e0b] hover:bg-[#d97706]"
                  disabled={isRoleSwitching}
                >
                  {isRoleSwitching ? "Switching..." : "Switch to Donor"}
                </Button>
                {roleSwitchMessage && <p className="text-sm text-gray-700 mt-3">{roleSwitchMessage}</p>}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Verification Details</h2>
                <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4 mb-4 space-y-3">
                  <div>
                    <Label htmlFor="volunteerVerificationGovId">Aadhaar / Government ID</Label>
                    <Input
                      id="volunteerVerificationGovId"
                      className="mt-2 rounded-2xl"
                      placeholder="Enter Aadhaar / Govt ID"
                      value={verificationGovernmentId}
                      onChange={(event) => {
                        setVerificationGovernmentId(event.target.value);
                        setVerificationDigiLockerVerified(false);
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="rounded-full bg-[#3b82f6] hover:bg-[#1d4ed8]"
                      onClick={handleVerifyVolunteerIdentity}
                      disabled={verificationActionLoading}
                    >
                      {verificationActionLoading ? "Verifying..." : verificationDigiLockerVerified ? "Re-verify DigiLocker" : "Verify via DigiLocker"}
                    </Button>
                    {verificationDigiLockerVerified && (
                      <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">Verified</Badge>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">Government ID Used</div>
                    <div className="text-sm text-gray-600 break-all">{verificationGovernmentId || "Not submitted"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">Verification Provider</div>
                    <div className="text-sm text-gray-600 capitalize">{verificationProvider || "Not available"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">DigiLocker Status</div>
                    <div className="text-sm text-gray-600">{verificationDigiLockerVerified ? "Verified" : "Not verified"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">NGO Link Status</div>
                    <div className="text-sm text-gray-600">{verificationNgoLinked ? "Linked to app" : "Not linked"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 md:col-span-2">
                    <div className="font-semibold mb-1">NGO Link Reference</div>
                    <div className="text-sm text-gray-600 break-all">{verificationNgoReference || "Not available"}</div>
                  </div>
                </div>

                {verificationIdProofImage && (
                  <div className="mt-4">
                    <div className="font-semibold mb-2">ID Proof Preview</div>
                    <div className="max-w-sm rounded-2xl overflow-hidden border border-gray-200">
                      <img src={verificationIdProofImage} alt="Government ID proof" className="w-full h-44 object-cover" />
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold">Achievement Badges</h2>
                  <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">{unlockedAchievements}/{achievements.length} Unlocked</Badge>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {achievements.map((achievement) => {
                    const unlocked = totalDeliveries >= achievement.threshold;
                    return (
                      <div key={achievement.id} className={`p-4 rounded-2xl border ${unlocked ? "bg-[#d1fae5] border-[#10b981]" : "bg-gray-50 border-gray-200"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold">{achievement.title}</div>
                          <Badge className={`rounded-full ${unlocked ? "bg-[#10b981] text-white" : "bg-gray-200 text-gray-700"}`}>{unlocked ? "Unlocked" : "Locked"}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{achievement.description}</p>
                        <p className="text-xs text-gray-500 mt-2">Target: {achievement.threshold} deliveries</p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {settingsMessage && (
                <Card className="p-4 rounded-2xl border-0 shadow-lg bg-[#dbeafe] text-[#1d4ed8]">{settingsMessage}</Card>
              )}
            </div>
          )}
        </main>
      </DashboardLayout>
    </>
  );
}
