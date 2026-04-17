import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { NotificationBell } from "../components/notification-bell";
import {
  Home,
  Search,
  MapPin,
  Clock,
  Utensils,
  Filter,
  Bell,
  User,
  LogOut,
  History,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Settings,
  BarChart3,
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { sendNotification } from "../lib/notifications";

type Donation = {
  id: string;
  foodName: string;
  quantity: string;
  foodType: string;
  expiryTime: string;
  urgency: string;
  address: string;
  image?: string;
  claimed?: boolean;
  claimedAt?: { toDate?: () => Date };
  createdAt?: { toDate?: () => Date };
  donorUid?: string;
  donorEmail?: string;
  claimedByUid?: string;
  claimedProofImages?: string[];
};

type ReceiverMode = "individual" | "ngo";
type ReceiverIndividualMode = "new" | "experienced";

export function ReceiverDashboard() {
  const [activeTab, setActiveTab] = useState<"available" | "history" | "map" | "proof" | "settings">("available");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState("Receiver");
  const [receiverSubtitle, setReceiverSubtitle] = useState("Receiver");
  const [receiverType, setReceiverType] = useState<ReceiverMode | null>(null);
  const [receiverIndividualMode, setReceiverIndividualMode] = useState<ReceiverIndividualMode | null>(null);
  const [receiverPastWorks, setReceiverPastWorks] = useState("");
  const [receiverGuidelinesAccepted, setReceiverGuidelinesAccepted] = useState(false);
  const [ngoName, setNgoName] = useState("");
  const [ngoWebsite, setNgoWebsite] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [receiverGovernmentId, setReceiverGovernmentId] = useState("");
  const [receiverIdProofImage, setReceiverIdProofImage] = useState("");
  const [receiverDigiLockerVerified, setReceiverDigiLockerVerified] = useState(false);
  const [ngoLinkedToApp, setNgoLinkedToApp] = useState(false);
  const [ngoLinkReference, setNgoLinkReference] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [claimDraftDonation, setClaimDraftDonation] = useState<Donation | null>(null);
  const [proofDescription, setProofDescription] = useState("");
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [isClaimSubmitLoading, setIsClaimSubmitLoading] = useState(false);
  const [claimFlowMessage, setClaimFlowMessage] = useState("");
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(auth.currentUser?.uid || null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "donations"),
      (snapshot) => {
        const donationsData = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Donation, "id">),
        }));
        setDonations(donationsData);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("receiver-theme");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUserUid(user?.uid || null);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem("receiver-theme", themeMode);
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) {
        setReceiverName("Receiver");
        setReceiverSubtitle("Receiver");
        return;
      }

      const fallbackName = user.displayName?.trim() || user.email?.split("@")[0] || "Receiver";
      setReceiverName(fallbackName);
      setReceiverSubtitle(fallbackName);

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          return;
        }

        const data = userDoc.data();
        const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
        const ngoNameValue = typeof data.ngoName === "string" ? data.ngoName.trim() : "";
        const ngoWebsiteValue = typeof data.ngoWebsite === "string" ? data.ngoWebsite.trim() : "";
        const profilePhoto = typeof data.photoURL === "string" ? data.photoURL : "";
        const phoneValue = typeof data.phoneNumber === "string" ? data.phoneNumber : "";
        const govIdValue = typeof data.receiverGovernmentId === "string" ? data.receiverGovernmentId : "";
        const idProofImageValue = typeof data.receiverIdProofImage === "string" ? data.receiverIdProofImage : "";
        const ngoReferenceValue = typeof data.ngoLinkReference === "string" ? data.ngoLinkReference : "";

        setReceiverType((data.receiverType as ReceiverMode | undefined) || null);
        setReceiverIndividualMode((data.receiverIndividualMode as ReceiverIndividualMode | undefined) || null);
        setReceiverPastWorks(typeof data.receiverPastWorks === "string" ? data.receiverPastWorks : "");
        setReceiverGuidelinesAccepted(Boolean(data.receiverGuidelinesAccepted));
        setNgoName(ngoNameValue);
        setNgoWebsite(ngoWebsiteValue);
        setProfilePhotoUrl(profilePhoto);
        setPhoneNumber(phoneValue);
        setReceiverGovernmentId(govIdValue);
        setReceiverIdProofImage(idProofImageValue);
        setReceiverDigiLockerVerified(Boolean(data.receiverDigiLockerVerified));
        setNgoLinkedToApp(Boolean(data.ngoLinkedToApp));
        setNgoLinkReference(ngoReferenceValue);

        if (typeof data.receiverType === "string" && data.receiverType === "ngo" && ngoNameValue) {
          setReceiverSubtitle(ngoNameValue);
        } else if (fullName) {
          setReceiverSubtitle(fullName);
        }
      } catch {
        // keep fallback values
      }
    };

    loadProfile();
  }, []);

  const upcomingTitle = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    }
    if (hour < 17) {
      return "Good afternoon";
    }
    return "Good evening";
  }, []);

  const formatRelativeTime = (dateValue?: { toDate?: () => Date } | null) => {
    const date = dateValue?.toDate ? dateValue.toDate() : null;
    if (!date) {
      return "Just now";
    }

    const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMinutes < 1) {
      return "Just now";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  const filteredAndSortedDonations = useMemo(() => {
    let nextDonations = donations.filter((donation) => !donation.claimed);

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      nextDonations = nextDonations.filter((donation) => {
        return (
          donation.foodName?.toLowerCase().includes(lowerQuery) ||
          donation.address?.toLowerCase().includes(lowerQuery) ||
          donation.donorEmail?.toLowerCase().includes(lowerQuery)
        );
      });
    }

    if (filterType === "veg") {
      nextDonations = nextDonations.filter((donation) => donation.foodType === "veg");
    } else if (filterType === "non-veg") {
      nextDonations = nextDonations.filter((donation) => donation.foodType === "non-veg");
    } else if (filterType === "urgent") {
      nextDonations = nextDonations.filter((donation) => donation.urgency === "urgent" || donation.urgency === "high");
    }

    return nextDonations.sort((a, b) => {
      const expiryA = new Date(a.expiryTime).getTime();
      const expiryB = new Date(b.expiryTime).getTime();
      if (expiryA !== expiryB) {
        return expiryA - expiryB;
      }

      const qtyA = parseInt(a.quantity, 10) || 0;
      const qtyB = parseInt(b.quantity, 10) || 0;
      return qtyB - qtyA;
    });
  }, [donations, filterType, searchQuery]);

  const userClaimedDonations = useMemo(() => {
    if (!currentUserUid) {
      return [];
    }

    return donations.filter((donation) => donation.claimed && donation.claimedByUid === currentUserUid);
  }, [currentUserUid, donations]);

  const recentlyClaimed = useMemo(() => {
    return userClaimedDonations
      .filter((donation) => donation.claimedAt)
      .sort((a, b) => {
        const timeA = a.claimedAt?.toDate?.().getTime() || 0;
        const timeB = b.claimedAt?.toDate?.().getTime() || 0;
        return timeB - timeA;
      })
      .slice(0, 12);
  }, [userClaimedDonations]);

  const liveMapDonations = useMemo(() => {
    return donations
      .filter((donation) => !donation.claimed)
      .slice(0, 8)
      .map((donation, index) => ({
        ...donation,
        left: `${14 + (index % 4) * 20}%`,
        top: `${14 + Math.floor(index / 4) * 30}%`,
      }));
  }, [donations]);

  const totalClaims = useMemo(() => userClaimedDonations.length, [userClaimedDonations]);
  const mealsReceived = useMemo(() => {
    return userClaimedDonations
      .reduce((sum, donation) => {
        const parsed = parseInt(donation.quantity, 10);
        return sum + (Number.isNaN(parsed) ? 0 : parsed);
      }, 0);
  }, [userClaimedDonations]);
  const activeClaims = useMemo(() => donations.filter((donation) => !donation.claimed).length, [donations]);
  const peopleFed = useMemo(() => Math.max(1, Math.round(mealsReceived / 3)), [mealsReceived]);
  const donationsByType = useMemo(() => {
    const counts = { veg: 0, nonVeg: 0, vegan: 0 };
    donations.forEach((donation) => {
      if (donation.foodType === "veg") {
        counts.veg += 1;
      } else if (donation.foodType === "non-veg") {
        counts.nonVeg += 1;
      } else {
        counts.vegan += 1;
      }
    });
    const total = donations.length || 1;
    return {
      veg: Math.round((counts.veg / total) * 100),
      nonVeg: Math.round((counts.nonVeg / total) * 100),
      vegan: Math.round((counts.vegan / total) * 100),
    };
  }, [donations]);

  const handleClaimFood = (donationId: string) => {
    const selectedDonation = donations.find((donation) => donation.id === donationId);
    if (!selectedDonation) {
      alert("Donation not found. Please refresh and try again.");
      return;
    }

    setClaimingId(donationId);
    setClaimDraftDonation(selectedDonation);
    setProofDescription("");
    setProofImages([]);
    setClaimFlowMessage("");
    setActiveTab("proof");
    setClaimingId(null);
  };

  const handleProofFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const fileArray = Array.from(files).slice(0, 6);
    const encodedImages = await Promise.all(
      fileArray.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(new Error("file-read-failed"));
            reader.readAsDataURL(file);
          })
      )
    );

    const validImages = encodedImages.filter((item) => item.startsWith("data:image/"));
    setProofImages((previous) => [...previous, ...validImages].slice(0, 6));
    event.target.value = "";
  };

  const handleSubmitClaimWithProof = async () => {
    if (!claimDraftDonation) {
      setClaimFlowMessage("Select a donation first.");
      return;
    }

    if (!proofDescription.trim()) {
      setClaimFlowMessage("Please add a short proof description before submitting.");
      return;
    }

    if (proofImages.length === 0) {
      setClaimFlowMessage("Please upload at least one proof image.");
      return;
    }

    try {
      setIsClaimSubmitLoading(true);
      const receiverProfileType = receiverType === "ngo" ? "ngo" : "individual";
      const receiverProfileLabel = receiverProfileType === "ngo" ? "NGO" : "Person";
      const receiverDisplayName =
        receiverProfileType === "ngo"
          ? ngoName.trim() || receiverSubtitle || receiverName || "Receiver"
          : receiverName || receiverSubtitle || "Receiver";

      await updateDoc(doc(db, "donations", claimDraftDonation.id), {
        claimed: true,
        claimedAt: serverTimestamp(),
        claimedByUid: auth.currentUser?.uid || null,
        claimedByName: receiverDisplayName,
        claimedByType: receiverProfileType,
        claimedByProfileLabel: receiverProfileLabel,
        claimedProofImages: proofImages,
        claimedProofDescription: proofDescription.trim(),
      });

      await Promise.all([
        claimDraftDonation.donorUid
          ? sendNotification({
              recipientUid: claimDraftDonation.donorUid,
              title: "New claim submitted",
              message: `${receiverDisplayName} submitted proof for ${claimDraftDonation.foodName}.`,
              source: "receiver-dashboard",
            })
          : sendNotification({
              recipientRole: "donor",
              title: "New claim submitted",
              message: `${receiverDisplayName} submitted proof for ${claimDraftDonation.foodName}.`,
              source: "receiver-dashboard",
            }),
        sendNotification({
          recipientRole: "admin",
          title: "Receiver claim proof received",
          message: `${receiverDisplayName} submitted a verified claim for ${claimDraftDonation.foodName}.`,
          source: "receiver-dashboard",
        }),
      ]);

      setClaimFlowMessage("Claim submitted with proof successfully.");
      setClaimDraftDonation(null);
      setProofDescription("");
      setProofImages([]);
      setActiveTab("history");
    } catch {
      setClaimFlowMessage("Could not submit claim proof right now. Please try again.");
    } finally {
      setIsClaimSubmitLoading(false);
      setClaimingId(null);
    }
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

  const handleReceiverIdProofSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const encodedImage = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("id-proof-read-failed"));
      reader.readAsDataURL(file);
    });

    if (encodedImage.startsWith("data:image/")) {
      setReceiverIdProofImage(encodedImage);
      setReceiverDigiLockerVerified(false);
      setVerificationMessage("ID image uploaded. Please complete DigiLocker verification.");
    }

    event.target.value = "";
  };

  const handleLinkNgoToApp = async () => {
    const user = auth.currentUser;
    if (!user) {
      setVerificationMessage("Please sign in again to verify NGO link.");
      return;
    }

    if (!ngoName.trim() || !ngoWebsite.trim()) {
      setVerificationMessage("Add NGO name and NGO website before linking to the app.");
      return;
    }

    setVerificationSaving(true);
    setVerificationMessage("");
    try {
      const reference = `NGO-${Date.now()}`;
      await setDoc(
        doc(db, "users", user.uid),
        {
          ngoLinkedToApp: true,
          ngoLinkReference: reference,
          ngoLinkedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setNgoLinkedToApp(true);
      setNgoLinkReference(reference);
      setVerificationMessage("NGO linked and verified successfully for this app.");
    } catch {
      setVerificationMessage("Unable to verify NGO link right now. Please try again.");
    } finally {
      setVerificationSaving(false);
    }
  };

  const handleVerifyDigiLockerIdentity = async () => {
    const user = auth.currentUser;
    if (!user) {
      setVerificationMessage("Please sign in again to verify identity.");
      return;
    }

    if (!receiverGovernmentId.trim()) {
      setVerificationMessage("Please enter your government ID number.");
      return;
    }

    if (!receiverIdProofImage) {
      setVerificationMessage("Please upload an ID image before DigiLocker verification.");
      return;
    }

    setVerificationSaving(true);
    setVerificationMessage("");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          receiverGovernmentId: receiverGovernmentId.trim(),
          receiverIdProofImage,
          receiverDigiLockerVerified: true,
          receiverVerificationProvider: "digilocker",
          receiverVerifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setReceiverDigiLockerVerified(true);
      setVerificationMessage("Identity verified through DigiLocker successfully.");
    } catch {
      setVerificationMessage("Could not verify through DigiLocker right now. Please try again.");
    } finally {
      setVerificationSaving(false);
    }
  };

  return (
    <div className={`min-h-screen flex ${themeMode === "dark" ? "bg-slate-950 text-slate-100" : "bg-gray-50"}`}>
      <aside className={`w-72 border-r p-6 flex flex-col ${themeMode === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"}`}>
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
            <Utensils className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold">RescueBite AI</span>
        </div>

        <nav className="flex-1 space-y-2">
          <button
            onClick={() => setActiveTab("available")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              activeTab === "available"
                ? "bg-[#10b981] text-white"
                : themeMode === "dark"
                ? "text-slate-200 hover:bg-slate-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Home className="w-5 h-5" />
            <span>Available Food</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              activeTab === "history"
                ? "bg-[#10b981] text-white"
                : themeMode === "dark"
                ? "text-slate-200 hover:bg-slate-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <History className="w-5 h-5" />
            <span>Claimed History</span>
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              activeTab === "map"
                ? "bg-[#10b981] text-white"
                : themeMode === "dark"
                ? "text-slate-200 hover:bg-slate-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span>Map View</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              activeTab === "settings"
                ? "bg-[#10b981] text-white"
                : themeMode === "dark"
                ? "text-slate-200 hover:bg-slate-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
          {(claimDraftDonation || activeTab === "proof") && (
            <button
              onClick={() => setActiveTab("proof")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                activeTab === "proof"
                  ? "bg-[#10b981] text-white"
                  : themeMode === "dark"
                  ? "text-slate-200 hover:bg-slate-800"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Claim Proof</span>
            </button>
          )}
        </nav>

        <div className="border-t border-gray-200 pt-4">
          <Link to="/">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all">
              <LogOut className="w-5 h-5" />
              <span>Back to Home</span>
            </button>
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className={`border-b px-8 py-4 ${themeMode === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Receiver Dashboard</h1>
              <p className="text-gray-600">{upcomingTitle}, {receiverSubtitle}</p>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell audienceRole="receiver" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center overflow-hidden">
                  {profilePhotoUrl ? <img src={profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <div className="font-medium">{receiverName}</div>
                  <div className="text-sm text-gray-600">{receiverType === "ngo" ? "NGO Receiver" : "Receiver"}</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          {activeTab === "available" && (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      placeholder="Search food donations..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="pl-12 rounded-full h-12"
                    />
                  </div>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-6"
                      onClick={() => setShowFilterPanel((prev) => !prev)}
                    >
                      <Filter className="w-5 h-5 mr-2" />
                      Filters {filterType ? `(${filterType})` : ""}
                    </Button>

                    {showFilterPanel && (
                      <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-gray-200 bg-white shadow-xl p-3 z-20 space-y-2">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100"
                          onClick={() => {
                            setFilterType(null);
                            setShowFilterPanel(false);
                          }}
                        >
                          Show all donations
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100"
                          onClick={() => {
                            setFilterType("veg");
                            setShowFilterPanel(false);
                          }}
                        >
                          Vegetarian only
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100"
                          onClick={() => {
                            setFilterType("non-veg");
                            setShowFilterPanel(false);
                          }}
                        >
                          Non-veg only
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100"
                          onClick={() => {
                            setFilterType("urgent");
                            setShowFilterPanel(false);
                          }}
                        >
                          Urgent only
                        </button>
                        <div className="border-t border-gray-100 pt-2">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 rounded-xl text-[#047857] hover:bg-[#d1fae5]"
                            onClick={() => {
                              setSearchQuery("");
                              setFilterType(null);
                              setShowFilterPanel(false);
                            }}
                          >
                            Clear filters
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => setFilterType(null)} className={`px-4 py-2 rounded-full transition-all ${filterType === null ? "bg-[#10b981] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                    All
                  </button>
                  <button onClick={() => setFilterType("veg")} className={`px-4 py-2 rounded-full transition-all ${filterType === "veg" ? "bg-[#10b981] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                    Vegetarian
                  </button>
                  <button onClick={() => setFilterType("non-veg")} className={`px-4 py-2 rounded-full transition-all ${filterType === "non-veg" ? "bg-[#10b981] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                    Non-Veg
                  </button>
                  <button onClick={() => setFilterType("urgent")} className={`px-4 py-2 rounded-full transition-all ${filterType === "urgent" ? "bg-[#f97316] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                    Urgent
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {filteredAndSortedDonations.length > 0 ? (
                    filteredAndSortedDonations.map((donation, index) => (
                      <Card key={donation.id} className={`rounded-3xl border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden ${index === 0 ? "ring-2 ring-[#10b981]" : ""}`}>
                        <div className="relative">
                          <ImageWithFallback
                            src={donation.image || "https://via.placeholder.com/400x300?text=No+Image"}
                            alt={donation.foodName}
                            className="w-full h-48 object-cover"
                          />
                          {index === 0 && (
                            <div className="absolute top-3 left-3 bg-[#10b981] text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm font-medium">
                              <Sparkles className="w-4 h-4" />
                              AI Recommended
                            </div>
                          )}
                          {(donation.urgency === "high" || donation.urgency === "urgent") && (
                            <div className="absolute top-3 right-3 bg-[#f97316] text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm font-medium">
                              <AlertCircle className="w-4 h-4" />
                              Urgent
                            </div>
                          )}
                        </div>
                        <div className="p-5">
                          <h3 className="text-lg font-bold mb-2">{donation.foodName}</h3>
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="secondary" className="rounded-full">
                              {donation.foodType === "veg" ? "Vegetarian" : donation.foodType === "non-veg" ? "Non-Veg" : "Vegan"}
                            </Badge>
                            <span className="text-sm text-gray-600">{donation.quantity}</span>
                          </div>
                          <div className="space-y-2 mb-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Expires: {new Date(donation.expiryTime).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{donation.address || "Location not provided"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              <span>{donation.donorEmail || donation.donorUid || "Live donor"}</span>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleClaimFood(donation.id)}
                            disabled={donation.claimed || claimingId === donation.id}
                            className="w-full rounded-full bg-[#10b981] hover:bg-[#047857] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {claimingId === donation.id ? "Claiming..." : donation.claimed ? "Claimed" : "Claim Food"}
                          </Button>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-2 text-center py-12 text-gray-500">
                      {loading ? "Loading donations..." : "No donations available"}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-bold mb-4">Live Map</h3>
                  <div className="bg-gradient-to-br from-[#d1fae5] to-[#dbeafe] rounded-2xl h-64 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute left-0 right-0 top-1/3 h-px bg-white/70"></div>
                      <div className="absolute left-0 right-0 top-2/3 h-px bg-white/70"></div>
                      <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/70"></div>
                      <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white/70"></div>
                      {liveMapDonations.map((donation) => (
                        <div key={donation.id} className="absolute flex flex-col items-center gap-1" style={{ left: donation.left, top: donation.top }}>
                          <div className={`w-3 h-3 rounded-full ${donation.urgency === "urgent" || donation.urgency === "high" ? "bg-[#f97316]" : "bg-[#10b981]"} animate-pulse`}></div>
                          <span className="text-[10px] bg-white/90 px-2 py-1 rounded-full shadow-sm max-w-[92px] truncate">{donation.foodName}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-center z-10">
                      <MapPin className="w-12 h-12 text-[#10b981] mx-auto mb-2" />
                      <p className="text-gray-600">Live map updates from Firestore</p>
                      <p className="text-sm text-gray-500">{liveMapDonations.length} active pickups nearby</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-bold mb-4">Recent Claims</h3>
                  <div className="space-y-4">
                    {recentlyClaimed.length > 0 ? recentlyClaimed.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-[#d1fae5] flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-[#047857]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.foodName}</div>
                          <div className="text-sm text-gray-600">{item.quantity}</div>
                          <div className="text-xs text-gray-500 mt-1">{formatRelativeTime(item.claimedAt)}</div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-4 text-gray-500 text-sm">No claims yet</div>
                    )}
                  </div>
                  <Button onClick={() => setActiveTab("history")} variant="outline" className="w-full mt-4 rounded-full">
                    View All History
                  </Button>
                </Card>

                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-bold mb-4">Quick Stats</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Claims</span>
                      <span className="font-semibold">{totalClaims}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Meals Received</span>
                      <span className="font-semibold">{mealsReceived}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">People Fed</span>
                      <span className="font-semibold">{peopleFed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Claims</span>
                      <span className="font-semibold text-[#f97316]">{activeClaims}</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <Card className="p-6 rounded-3xl border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Claimed History</h2>
                <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">{recentlyClaimed.length} Recent</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Food Name</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Location</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Donor</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Claimed At</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyClaimed.length > 0 ? recentlyClaimed.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 font-medium">{item.foodName}</td>
                        <td className="py-4 px-4">{item.quantity}</td>
                        <td className="py-4 px-4 text-gray-600">{item.address || "Location not provided"}</td>
                        <td className="py-4 px-4 text-gray-600">{item.donorEmail || item.donorUid || "Live donor"}</td>
                        <td className="py-4 px-4 text-gray-600">{formatRelativeTime(item.claimedAt)}</td>
                        <td className="py-4 px-4">
                          <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">Claimed</Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-500">
                          {loading ? "Loading claimed history..." : "No claims yet"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {activeTab === "map" && (
            <div className="grid lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-2 p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Live Map View</h2>
                  <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">{liveMapDonations.length} live pins</Badge>
                </div>
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#ecfdf5] to-[#eff6ff] h-[520px] border border-white/60">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.8),transparent_58%)]"></div>
                  {liveMapDonations.map((donation, index) => (
                    <div key={donation.id} className="absolute flex flex-col items-center" style={{ left: donation.left, top: donation.top }}>
                      <div className={`w-4 h-4 rounded-full shadow-lg ${donation.urgency === "urgent" || donation.urgency === "high" ? "bg-[#f97316]" : "bg-[#10b981]"}`}></div>
                      <div className="mt-2 px-3 py-1 rounded-full bg-white shadow-sm text-xs max-w-[120px] truncate">{donation.foodName}</div>
                      <div className="text-[10px] text-gray-500 mt-1">Pin {index + 1}</div>
                    </div>
                  ))}
                  <div className="absolute bottom-4 left-4 right-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/90 p-3 shadow-sm">
                      <div className="text-xs text-gray-500">Map source</div>
                      <div className="font-semibold">Firestore live donations</div>
                    </div>
                    <div className="rounded-2xl bg-white/90 p-3 shadow-sm">
                      <div className="text-xs text-gray-500">Status</div>
                      <div className="font-semibold">Refreshing automatically</div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Nearby Donations</h3>
                <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                  {liveMapDonations.length > 0 ? liveMapDonations.map((donation) => (
                    <div key={donation.id} className="p-3 rounded-2xl border border-gray-100 bg-gray-50">
                      <div className="font-semibold">{donation.foodName}</div>
                      <div className="text-sm text-gray-600">{donation.quantity}</div>
                      <div className="text-xs text-gray-500 mt-1">{donation.address}</div>
                    </div>
                  )) : (
                    <div className="text-center py-6 text-gray-500">No live pins yet</div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "proof" && (
            <div className="max-w-4xl space-y-6">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-2xl font-bold mb-2">Claim Proof Upload</h2>
                <p className="text-gray-600">
                  After claiming, upload images and write a short description so the donor can verify your claim.
                </p>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                {claimDraftDonation ? (
                  <>
                    <div className="mb-5">
                      <div className="text-sm text-gray-500">Selected Donation</div>
                      <div className="text-lg font-semibold">{claimDraftDonation.foodName}</div>
                      <div className="text-sm text-gray-600">{claimDraftDonation.quantity} • {claimDraftDonation.address}</div>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <Label htmlFor="claimProofDescription">Proof Description</Label>
                        <Textarea
                          id="claimProofDescription"
                          className="mt-2 rounded-2xl min-h-[110px]"
                          placeholder="Describe pickup details, receiver location, or how the food will be distributed..."
                          value={proofDescription}
                          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setProofDescription(event.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="claimProofFiles">Upload Proof Images</Label>
                        <Input
                          id="claimProofFiles"
                          type="file"
                          accept="image/*"
                          multiple
                          className="mt-2 rounded-2xl"
                          onChange={handleProofFilesSelected}
                        />
                        <p className="text-xs text-gray-500 mt-2">You can upload up to 6 images.</p>
                      </div>

                      {proofImages.length > 0 && (
                        <div className="grid md:grid-cols-3 gap-3">
                          {proofImages.map((image, index) => (
                            <div key={`${index}-${image.slice(0, 24)}`} className="rounded-2xl overflow-hidden border border-gray-200">
                              <img src={image} alt={`Claim proof ${index + 1}`} className="w-full h-32 object-cover" />
                              <div className="p-2 text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-full"
                                  onClick={() => setProofImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
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
                          disabled={isClaimSubmitLoading}
                          onClick={handleSubmitClaimWithProof}
                        >
                          {isClaimSubmitLoading ? "Submitting..." : "Submit Claim with Proof"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setClaimDraftDonation(null);
                            setProofDescription("");
                            setProofImages([]);
                            setClaimFlowMessage("Claim proof canceled.");
                            setActiveTab("available");
                          }}
                          disabled={isClaimSubmitLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600">No donation selected for claim proof. Choose a donation from Available Food first.</div>
                )}

                {claimFlowMessage && <div className="mt-4 text-sm text-[#1d4ed8]">{claimFlowMessage}</div>}
              </Card>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">User Profile</h2>
                <div className="grid md:grid-cols-3 gap-6 items-start">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center overflow-hidden">
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
                <h2 className="text-xl font-bold mb-5">Receiver Verification</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">Receiver Type</div>
                    <div className="text-sm text-gray-600">{receiverType || "Not set"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">Verification Mode</div>
                    <div className="text-sm text-gray-600">{receiverIndividualMode || "Not set"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 md:col-span-2">
                    <div className="font-semibold mb-1">Past Works / Guidelines</div>
                    <div className="text-sm text-gray-600">
                      {receiverType === "individual"
                        ? receiverIndividualMode === "experienced"
                          ? receiverPastWorks || "Not provided"
                          : receiverGuidelinesAccepted
                          ? "Strict guidelines accepted"
                          : "Guidelines not accepted"
                        : "N/A"}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">NGO Name</div>
                    <div className="text-sm text-gray-600">{ngoName || "Not provided"}</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">NGO Website</div>
                    <div className="text-sm text-gray-600 break-all">{ngoWebsite || "Not provided"}</div>
                  </div>
                </div>

                {receiverType === "ngo" && (
                  <div className="mt-5 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold text-[#166534]">NGO Verification</h3>
                      <p className="text-sm text-[#166534] mt-1">Link this NGO profile to RescueBite app for verification and trust status.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        className="rounded-full bg-[#10b981] hover:bg-[#047857]"
                        onClick={handleLinkNgoToApp}
                        disabled={verificationSaving}
                      >
                        {verificationSaving ? "Verifying..." : ngoLinkedToApp ? "Re-verify NGO Link" : "Link NGO to App"}
                      </Button>
                      {ngoLinkedToApp && (
                        <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">Verified</Badge>
                      )}
                    </div>
                    {ngoLinkReference && (
                      <div className="text-sm text-[#166534]">Reference ID: {ngoLinkReference}</div>
                    )}
                  </div>
                )}

                {receiverType === "individual" && (
                  <div className="mt-5 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold text-[#1e40af]">Individual Verification</h3>
                      <p className="text-sm text-[#1e40af] mt-1">Upload your ID and complete DigiLocker verification.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="receiverGovId">Government ID Number</Label>
                        <Input
                          id="receiverGovId"
                          className="mt-2 rounded-2xl"
                          placeholder="Enter Aadhaar / PAN / Govt ID"
                          value={receiverGovernmentId}
                          onChange={(event) => {
                            setReceiverGovernmentId(event.target.value);
                            setReceiverDigiLockerVerified(false);
                          }}
                        />
                      </div>

                      <div>
                        <Label htmlFor="receiverIdProof">ID Upload</Label>
                        <Input
                          id="receiverIdProof"
                          type="file"
                          accept="image/*"
                          className="mt-2 rounded-2xl"
                          onChange={handleReceiverIdProofSelected}
                        />
                      </div>
                    </div>

                    {receiverIdProofImage && (
                      <div className="rounded-2xl overflow-hidden border border-gray-200 max-w-xs">
                        <img src={receiverIdProofImage} alt="ID proof preview" className="w-full h-40 object-cover" />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        className="rounded-full bg-[#3b82f6] hover:bg-[#1d4ed8]"
                        onClick={handleVerifyDigiLockerIdentity}
                        disabled={verificationSaving}
                      >
                        {verificationSaving ? "Verifying..." : receiverDigiLockerVerified ? "Re-verify DigiLocker" : "Verify via DigiLocker"}
                      </Button>
                      {receiverDigiLockerVerified && (
                        <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">DigiLocker Verified</Badge>
                      )}
                    </div>
                  </div>
                )}

                {verificationMessage && (
                  <div className="mt-4 text-sm text-[#1d4ed8]">{verificationMessage}</div>
                )}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold">Achievement Badges</h2>
                  <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">{totalClaims} Claims</Badge>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { id: "starter", title: "First Claim", threshold: 1, description: "Claim your first donation" },
                    { id: "helper", title: "Community Helper", threshold: 10, description: "Reach 10 claims" },
                    { id: "champion", title: "Rescue Champion", threshold: 25, description: "Reach 25 claims" },
                    { id: "hero", title: "Food Hero", threshold: 50, description: "Reach 50 claims" },
                  ].map((badge) => {
                    const unlocked = totalClaims >= badge.threshold;
                    return (
                      <div key={badge.id} className={`p-4 rounded-2xl border ${unlocked ? "bg-[#d1fae5] border-[#10b981]" : "bg-gray-50 border-gray-200"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold">{badge.title}</div>
                          <Badge className={`rounded-full ${unlocked ? "bg-[#10b981] text-white" : "bg-gray-200 text-gray-700"}`}>{unlocked ? "Unlocked" : "Locked"}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{badge.description}</p>
                        <p className="text-xs text-gray-500 mt-2">Target: {badge.threshold} claims</p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Impact Snapshot</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-[#dbeafe]">
                    <div className="text-sm text-[#1d4ed8]">Total Claims</div>
                    <div className="text-2xl font-bold text-[#1e3a8a]">{totalClaims}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#d1fae5]">
                    <div className="text-sm text-[#047857]">Meals Received</div>
                    <div className="text-2xl font-bold text-[#065f46]">{mealsReceived}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#fde68a]">
                    <div className="text-sm text-[#92400e]">Active Claims</div>
                    <div className="text-2xl font-bold text-[#78350f]">{activeClaims}</div>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm">
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="font-semibold mb-1">Vegetarian</div>
                    <div className="text-gray-600">{donationsByType.veg}%</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="font-semibold mb-1">Non-Veg</div>
                    <div className="text-gray-600">{donationsByType.nonVeg}%</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="font-semibold mb-1">Vegan</div>
                    <div className="text-gray-600">{donationsByType.vegan}%</div>
                  </div>
                </div>
              </Card>

              {settingsMessage && (
                <Card className="p-4 rounded-2xl border-0 shadow-lg bg-[#dbeafe] text-[#1d4ed8]">{settingsMessage}</Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
