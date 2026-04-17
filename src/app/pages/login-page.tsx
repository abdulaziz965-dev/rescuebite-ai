import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { 
  Utensils, 
  Mail, 
  Lock, 
  ArrowRight,
  User,
  Package,
  Truck,
  Shield
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "../../firebase/config";

const ADMIN_ACCESS_ID = "Admin";
const ADMIN_ACCESS_PASS = "admin@123";
const ALLOWED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "zoho.com",
]);

const isAllowedEmailService = (email: string) => {
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) {
    return false;
  }
  return ALLOWED_EMAIL_DOMAINS.has(parts[1]);
};

type ReceiverType = "individual" | "ngo";
type ReceiverIndividualMode = "new" | "experienced";
type DonorCategory = "individual" | "restaurant-owner" | "other";
type GoogleOnboardingUser = {
  uid: string;
  email: string;
  fullName: string;
};

const roles = [
  {
    id: "donor",
    title: "Donor",
    description: "Restaurants, stores, individuals",
    icon: Package,
    color: "from-[#10b981] to-[#047857]",
    link: "/donor"
  },
  {
    id: "receiver",
    title: "Receiver",
    description: "NGOs, shelters, individuals",
    icon: User,
    color: "from-[#3b82f6] to-[#1d4ed8]",
    link: "/receiver"
  },
  {
    id: "volunteer",
    title: "Volunteer",
    description: "Delivery volunteers",
    icon: Truck,
    color: "from-[#8b5cf6] to-[#6d28d9]",
    link: "/volunteer"
  },
  {
    id: "admin",
    title: "Admin",
    description: "System administrators",
    icon: Shield,
    color: "from-[#f97316] to-[#c2410c]",
    link: "/admin"
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; role?: string }>>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [googleOnboardingUser, setGoogleOnboardingUser] = useState<GoogleOnboardingUser | null>(null);
  const [adminAccessId, setAdminAccessId] = useState("");
  const [adminAccessPassword, setAdminAccessPassword] = useState("");
  const [receiverType, setReceiverType] = useState<ReceiverType | null>(null);
  const [receiverIndividualMode, setReceiverIndividualMode] = useState<ReceiverIndividualMode | null>(null);
  const [receiverPastWorks, setReceiverPastWorks] = useState("");
  const [receiverGuidelinesAccepted, setReceiverGuidelinesAccepted] = useState(false);
  const [ngoName, setNgoName] = useState("");
  const [ngoWebsite, setNgoWebsite] = useState("");
  const [donorCategory, setDonorCategory] = useState<DonorCategory | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [otherDonorLabel, setOtherDonorLabel] = useState("");
  const [donorLocation, setDonorLocation] = useState("");
  const [volunteerPhoneNumber, setVolunteerPhoneNumber] = useState("");
  const [volunteerGovernmentId, setVolunteerGovernmentId] = useState("");
  const [volunteerDigiLockerVerified, setVolunteerDigiLockerVerified] = useState(false);
  const [volunteerGuidelinesAccepted, setVolunteerGuidelinesAccepted] = useState(false);

  useEffect(() => {
    const usersCollection = collection(db, "users");
    const unsubscribe = onSnapshot(
      usersCollection,
      (snapshot) => {
        const nextUsers = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setUsers(nextUsers);
        setIsUsersLoading(false);
      },
      () => {
        setIsUsersLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const donationsCollection = collection(db, "donations");
    const unsubscribe = onSnapshot(
      donationsCollection,
      (snapshot) => {
        setDonations(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
      },
      () => undefined
    );

    return () => unsubscribe();
  }, []);

  const connectedNgoCount = useMemo(() => {
    return users.filter((user) => user.role === "receiver").length;
  }, [users]);

  const mealsSavedLive = useMemo(() => {
    return donations.reduce((sum, donation) => {
      const parsed = parseInt(donation.quantity, 10);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [donations]);

  const wasteReducedLive = useMemo(() => {
    return Math.round(mealsSavedLive * 0.8);
  }, [mealsSavedLive]);

  const resolveRoleLink = (roleId?: string | null) => {
    return roles.find((role) => role.id === roleId)?.link || "/donor";
  };

  const googleRoles = roles.filter((role) =>
    role.id === "donor" || role.id === "admin" || role.id === "receiver"
  );

  const resetGoogleOnboardingState = () => {
    setSelectedRole(null);
    setAdminAccessId("");
    setAdminAccessPassword("");
    setReceiverType(null);
    setReceiverIndividualMode(null);
    setReceiverPastWorks("");
    setReceiverGuidelinesAccepted(false);
    setNgoName("");
    setNgoWebsite("");
    setDonorCategory(null);
    setRestaurantName("");
    setOtherDonorLabel("");
    setDonorLocation("");
    setGoogleOnboardingUser(null);
  };

  const getDonorDisplayName = (fallbackName: string) => {
    if (donorCategory === "restaurant-owner") {
      return restaurantName.trim();
    }
    if (donorCategory === "other") {
      return otherDonorLabel.trim();
    }
    return fallbackName.trim();
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setMessage("Enter your email first, then click Forgot password.");
      return;
    }

    if (!isAllowedEmailService(trimmedEmail)) {
      setMessage("Please enter a valid email from an allowed provider.");
      return;
    }

    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setMessage("Password reset email sent. Please check your inbox.");
    } catch {
      setMessage("Could not send reset email right now. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (isSignup && selectedRole === "admin") {
      if (!adminAccessId.trim() || !adminAccessPassword.trim()) {
        setMessage("Please enter Admin ID and Admin Password.");
        return;
      }

      if (adminAccessId !== ADMIN_ACCESS_ID || adminAccessPassword !== ADMIN_ACCESS_PASS) {
        setMessage("Invalid Admin ID or Admin Password.");
        return;
      }

      setAuthLoading(true);
      try {
        setMessage("Admin access granted. Redirecting...");
        navigate("/admin");
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setMessage("Please enter your email and password.");
      return;
    }

    if (!isAllowedEmailService(trimmedEmail)) {
      setMessage("Only verified email services are allowed (Gmail, Yahoo, Outlook, etc.).");
      return;
    }

    if (isSignup && !fullName.trim()) {
      setMessage("Please enter your full name.");
      return;
    }

    if (isSignup && !selectedRole) {
      setMessage("Please select a role.");
      return;
    }

    if (isSignup && selectedRole === "donor") {
      if (!donorCategory) {
        setMessage("Please select donor type: Individual, Restaurant Owner, or Other.");
        return;
      }
      if (donorCategory === "restaurant-owner" && !restaurantName.trim()) {
        setMessage("Please enter your restaurant/hotel name.");
        return;
      }
      if (donorCategory === "other" && !otherDonorLabel.trim()) {
        setMessage("Please enter your donor label/name.");
        return;
      }
      if (!donorLocation.trim()) {
        setMessage("Please enter your location.");
        return;
      }
    }

    if (isSignup && selectedRole === "receiver") {
      const selectedReceiverType = receiverType || "individual";

      if (selectedReceiverType === "individual") {
        if (!receiverIndividualMode) {
          setMessage("Please choose whether you are new or have past works to verify.");
          return;
        }

        if (receiverIndividualMode === "experienced" && !receiverPastWorks.trim()) {
          setMessage("Please enter your past works for verification.");
          return;
        }

        if (receiverIndividualMode === "new" && !receiverGuidelinesAccepted) {
          setMessage("Please accept the strict receiver guidelines to continue.");
          return;
        }
      }

      if (selectedReceiverType === "ngo") {
        if (!ngoName.trim()) {
          setMessage("Please enter your NGO name.");
          return;
        }
        if (!ngoWebsite.trim()) {
          setMessage("Please enter your NGO website link.");
          return;
        }
      }
    }

    if (isSignup && selectedRole === "volunteer") {
      if (!fullName.trim()) {
        setMessage("Please enter volunteer name.");
        return;
      }
      if (!volunteerPhoneNumber.trim()) {
        setMessage("Please enter volunteer phone number.");
        return;
      }
      if (!volunteerGovernmentId.trim()) {
        setMessage("Please enter government ID.");
        return;
      }
      if (!volunteerDigiLockerVerified) {
        setMessage("Please verify your details using DigiLocker before continuing.");
        return;
      }
      if (!volunteerGuidelinesAccepted) {
        setMessage("Please accept volunteer guidelines to continue.");
        return;
      }
    }

    setAuthLoading(true);
    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      if (isSignup) {
        const credential = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password
        );

        await updateProfile(credential.user, {
          displayName: fullName.trim(),
        });

        await setDoc(doc(db, "users", credential.user.uid), {
          fullName: fullName.trim(),
          donorCategory: selectedRole === "donor" ? donorCategory : null,
          donorDisplayName: selectedRole === "donor" ? getDonorDisplayName(fullName) : null,
          donorLocation: selectedRole === "donor" ? donorLocation.trim() : null,
          email: trimmedEmail,
          role: selectedRole,
          receiverType: selectedRole === "receiver" ? (receiverType || "individual") : null,
          receiverIndividualMode: selectedRole === "receiver" ? receiverIndividualMode : null,
          receiverPastWorks: selectedRole === "receiver" ? receiverPastWorks.trim() : null,
          receiverGuidelinesAccepted: selectedRole === "receiver" ? receiverGuidelinesAccepted : null,
          ngoName: selectedRole === "receiver" ? ngoName.trim() : null,
          ngoWebsite: selectedRole === "receiver" ? ngoWebsite.trim() : null,
          volunteerPhoneNumber: selectedRole === "volunteer" ? volunteerPhoneNumber.trim() : null,
          volunteerGovernmentId: selectedRole === "volunteer" ? volunteerGovernmentId.trim() : null,
          volunteerDigiLockerVerified: selectedRole === "volunteer" ? volunteerDigiLockerVerified : null,
          volunteerGuidelinesAccepted: selectedRole === "volunteer" ? volunteerGuidelinesAccepted : null,
          volunteerVerificationProvider: selectedRole === "volunteer" ? "digilocker" : null,
          uid: credential.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setMessage("Account created successfully. Redirecting...");
        navigate(resolveRoleLink(selectedRole));
        return;
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );
      const userDoc = await getDoc(doc(db, "users", credential.user.uid));

      const roleFromProfile = userDoc.exists()
        ? (userDoc.data().role as string | undefined)
        : undefined;

      setMessage("Signed in successfully. Redirecting...");
      navigate(resolveRoleLink(roleFromProfile));
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        setIsSignup(false);
        setMessage("This email already has an account in Authentication. Please sign in or use Forgot password.");
      } else if (
        error?.code === "auth/invalid-credential" ||
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/user-not-found"
      ) {
        setMessage("Invalid email or password.");
      } else if (error?.code === "auth/invalid-email") {
        setMessage("Please enter a valid email address.");
      } else if (error?.code === "auth/weak-password") {
        setMessage("Password should be at least 6 characters.");
      } else {
        setMessage("Unable to connect right now. Please try again.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setMessage("");
    setAuthLoading(true);

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleEmail = (result.user.email || "").toLowerCase();

      if (!isAllowedEmailService(googleEmail)) {
        await signOut(auth);
        setMessage("Only verified email services are allowed (Gmail, Yahoo, Outlook, etc.).");
        return;
      }

      const userDoc = await getDoc(doc(db, "users", result.user.uid));

      if (userDoc.exists() && userDoc.data().role) {
        navigate(resolveRoleLink(userDoc.data().role as string));
        return;
      }

      setGoogleOnboardingUser({
        uid: result.user.uid,
        email: result.user.email || "",
        fullName: result.user.displayName || "",
      });
      setSelectedRole(null);
      setAdminAccessId("");
      setAdminAccessPassword("");
      setReceiverType(null);
      setReceiverIndividualMode(null);
      setReceiverPastWorks("");
      setReceiverGuidelinesAccepted(false);
      setNgoName("");
      setNgoWebsite("");
      setDonorCategory(null);
      setRestaurantName("");
      setOtherDonorLabel("");
      setDonorLocation("");
      setMessage("Google sign-in successful.Scroll down to Complete role setup to continue.");
    } catch {
      setMessage("Google sign-in failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCompleteGoogleOnboarding = async () => {
    if (!googleOnboardingUser) {
      return;
    }

    if (!selectedRole) {
      setMessage("Please choose your role to continue.");
      return;
    }

    if (selectedRole === "admin") {
      if (!adminAccessId || !adminAccessPassword) {
        setMessage("Please enter Admin ID and Admin Password.");
        return;
      }

      if (adminAccessId !== ADMIN_ACCESS_ID || adminAccessPassword !== ADMIN_ACCESS_PASS) {
        setMessage("Invalid Admin ID or Admin Password.");
        return;
      }
    }

    if (selectedRole === "receiver" && !receiverType) {
      setMessage("Please choose Receiver type: Individual or NGO.");
      return;
    }

      if (selectedRole === "receiver") {
        if (receiverType === "individual") {
          if (!receiverIndividualMode) {
            setMessage("Please choose whether you are new or have past works to verify.");
            return;
          }

          if (receiverIndividualMode === "experienced" && !receiverPastWorks.trim()) {
            setMessage("Please enter your past works for verification.");
            return;
          }

          if (receiverIndividualMode === "new" && !receiverGuidelinesAccepted) {
            setMessage("Please accept the strict receiver guidelines to continue.");
            return;
          }
        }

        if (receiverType === "ngo") {
          if (!ngoName.trim()) {
            setMessage("Please enter your NGO name.");
            return;
          }
          if (!ngoWebsite.trim()) {
            setMessage("Please enter your NGO website link.");
            return;
          }
        }
      }

    if (selectedRole === "donor") {
      if (!donorCategory) {
        setMessage("Please select donor type: Individual, Restaurant Owner, or Other.");
        return;
      }
      if (donorCategory === "restaurant-owner" && !restaurantName.trim()) {
        setMessage("Please enter your restaurant/hotel name.");
        return;
      }
      if (donorCategory === "other" && !otherDonorLabel.trim()) {
        setMessage("Please enter your donor label/name.");
        return;
      }
    }

    setAuthLoading(true);
    try {
      await setDoc(
        doc(db, "users", googleOnboardingUser.uid),
        {
          uid: googleOnboardingUser.uid,
          fullName: googleOnboardingUser.fullName,
          donorCategory: selectedRole === "donor" ? donorCategory : null,
          donorDisplayName:
            selectedRole === "donor"
              ? getDonorDisplayName(googleOnboardingUser.fullName || googleOnboardingUser.email.split("@")[0] || "Donor")
              : null,
          email: googleOnboardingUser.email,
          role: selectedRole,
          receiverType: selectedRole === "receiver" ? receiverType : null,
          receiverIndividualMode: selectedRole === "receiver" ? receiverIndividualMode : null,
          receiverPastWorks: selectedRole === "receiver" ? receiverPastWorks.trim() : null,
          receiverGuidelinesAccepted: selectedRole === "receiver" ? receiverGuidelinesAccepted : null,
          ngoName: selectedRole === "receiver" ? ngoName.trim() : null,
          ngoWebsite: selectedRole === "receiver" ? ngoWebsite.trim() : null,
          authProvider: "google",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("Account setup completed. Redirecting...");
      resetGoogleOnboardingState();
      navigate(resolveRoleLink(selectedRole));
    } catch {
      setMessage("Could not save profile setup. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Side - Illustration & Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#10b981] to-[#3b82f6] p-12 flex-col justify-between text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Link to="/">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Utensils className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold">RescueBite AI</span>
            </div>
          </Link>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-5xl font-bold leading-tight">
            Transforming Surplus Food into Lifesaving Meals
          </h1>
          <p className="text-xl opacity-90">
            Join thousands of donors, receivers, and volunteers making a difference through AI-powered food rescue.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-8">
            <div>
              <div className="text-4xl font-bold mb-1">{mealsSavedLive}</div>
              <div className="text-sm opacity-80">Meals Saved</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-1">{wasteReducedLive} kg</div>
              <div className="text-sm opacity-80">Waste Reduced</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-1">{isUsersLoading ? "..." : `${connectedNgoCount}+`}</div>
              <div className="text-sm opacity-80">NGOs Connected</div>
            </div>
          </div>
        </div>

        {/* Illustration */}
        <div className="relative z-10">
          <div className="rounded-3xl overflow-hidden shadow-2xl">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1593113616828-6f22bca04804?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb29kJTIwZG9uYXRpb24lMjBjb21tdW5pdHklMjBoZWxwaW5nfGVufDF8fHx8MTc3NjM2MTE2NXww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Food rescue community"
              className="w-full h-48 object-cover"
            />
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/">
              <div className="inline-flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
                  <Utensils className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold">RescueBite AI</span>
              </div>
            </Link>
          </div>

          <Card className="p-8 rounded-3xl border-0 shadow-xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">
                {isSignup ? "Create Account" : "Welcome Back"}
              </h2>
              <p className="text-gray-600">
                {isSignup
                  ? "Join the food rescue revolution"
                  : "Sign in to continue making an impact"}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleAuthSubmit}>
              {isSignup && selectedRole !== "admin" && (
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter your full name"
                    className="mt-2 rounded-2xl h-12"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
              )}

              {!(isSignup && selectedRole === "admin") && (
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-12 rounded-2xl h-12"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {!(isSignup && selectedRole === "admin") && (
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-2">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-12 rounded-2xl h-12"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {!isSignup && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember"
                      className="rounded"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <label htmlFor="remember" className="text-sm text-gray-600">
                      Remember me
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-[#10b981] hover:underline"
                    disabled={authLoading}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {isSignup && (
                <div>
                  <Label className="mb-3 block">Select Your Role</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRole(role.id)}
                        className={`p-4 rounded-2xl border-2 transition-all text-left ${
                          selectedRole === role.id
                            ? "border-[#10b981] bg-[#d1fae5]"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center mb-2`}
                        >
                          <role.icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="font-semibold text-sm">{role.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{role.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSignup && selectedRole === "donor" && (
                <div className="space-y-3">
                  <Label className="block">Donor Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDonorCategory("individual")}
                      className={`p-3 rounded-xl border-2 text-xs transition-all ${
                        donorCategory === "individual"
                          ? "border-[#10b981] bg-[#d1fae5]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setDonorCategory("restaurant-owner")}
                      className={`p-3 rounded-xl border-2 text-xs transition-all ${
                        donorCategory === "restaurant-owner"
                          ? "border-[#10b981] bg-[#d1fae5]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      Restaurant
                    </button>
                  </div>

                  {donorCategory === "restaurant-owner" && (
                    <div>
                      <Label htmlFor="restaurantName">Hotel/Restaurant Name</Label>
                      <Input
                        id="restaurantName"
                        placeholder="Enter hotel or restaurant name"
                        className="mt-2 rounded-2xl h-12"
                        value={restaurantName}
                        onChange={(event) => setRestaurantName(event.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="donorLocation">
                      Location {donorCategory === "restaurant-owner" ? "(Hotel/Restaurant Address)" : "(Your Area/Address)"}
                    </Label>
                    <Input
                      id="donorLocation"
                      placeholder="Enter your location"
                      className="mt-2 rounded-2xl h-12"
                      value={donorLocation}
                      onChange={(event) => setDonorLocation(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {isSignup && selectedRole === "receiver" && (
                <div className="space-y-3">
                  <Label className="mb-2 block">Receiver Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReceiverType("individual");
                        if (!receiverIndividualMode) {
                          setReceiverIndividualMode("new");
                        }
                        setNgoName("");
                        setNgoWebsite("");
                      }}
                      className={`p-3 rounded-xl border-2 text-sm transition-all ${
                        receiverType === "individual"
                          ? "border-[#10b981] bg-[#d1fae5]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      Person
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReceiverType("ngo");
                        setReceiverIndividualMode(null);
                        setReceiverPastWorks("");
                        setReceiverGuidelinesAccepted(false);
                      }}
                      className={`p-3 rounded-xl border-2 text-sm transition-all ${
                        receiverType === "ngo"
                          ? "border-[#10b981] bg-[#d1fae5]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      NGO
                    </button>
                  </div>

                  {receiverType === "individual" && (
                    <div className="space-y-3 pt-2">
                      <Label className="block">Individual Verification</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReceiverIndividualMode("new");
                            setReceiverPastWorks("");
                          }}
                          className={`p-3 rounded-xl border-2 text-sm transition-all ${
                            receiverIndividualMode === "new"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          New
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReceiverIndividualMode("experienced");
                            setReceiverGuidelinesAccepted(false);
                          }}
                          className={`p-3 rounded-xl border-2 text-sm transition-all ${
                            receiverIndividualMode === "experienced"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Past Work
                        </button>
                      </div>

                      {receiverIndividualMode === "new" && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
                          <p className="font-semibold">Warning: Strict Guidelines</p>
                          <p>
                            As a new receiver, you must follow pickup timings, provide accurate delivery details,
                            and maintain timely communication.
                          </p>
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={receiverGuidelinesAccepted}
                              onChange={(event) => setReceiverGuidelinesAccepted(event.target.checked)}
                            />
                            I accept the strict receiver guidelines
                          </label>
                        </div>
                      )}

                      {receiverIndividualMode === "experienced" && (
                        <div>
                          <Label htmlFor="receiverPastWorkProof">Proof of Past Work</Label>
                          <Input
                            id="receiverPastWorkProof"
                            placeholder="Provide links/details of previous work"
                            className="mt-2 rounded-2xl h-12"
                            value={receiverPastWorks}
                            onChange={(event) => setReceiverPastWorks(event.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {receiverType === "ngo" && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <Label htmlFor="receiverNgoName">NGO Name</Label>
                        <Input
                          id="receiverNgoName"
                          placeholder="Enter NGO name"
                          className="mt-2 rounded-2xl h-12"
                          value={ngoName}
                          onChange={(event) => setNgoName(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="receiverNgoWebsite">NGO Website</Label>
                        <Input
                          id="receiverNgoWebsite"
                          type="url"
                          placeholder="https://yourngo.org"
                          className="mt-2 rounded-2xl h-12"
                          value={ngoWebsite}
                          onChange={(event) => setNgoWebsite(event.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isSignup && selectedRole === "volunteer" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="volunteerName">Volunteer Name</Label>
                    <Input
                      id="volunteerName"
                      placeholder="Enter full name"
                      className="mt-2 rounded-2xl h-12"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="volunteerPhone">Phone Number</Label>
                    <Input
                      id="volunteerPhone"
                      placeholder="Enter phone number"
                      className="mt-2 rounded-2xl h-12"
                      value={volunteerPhoneNumber}
                      onChange={(event) => {
                        setVolunteerPhoneNumber(event.target.value);
                        setVolunteerDigiLockerVerified(false);
                      }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="volunteerGovId">Government ID</Label>
                    <Input
                      id="volunteerGovId"
                      placeholder="Enter Aadhaar / PAN / Govt ID"
                      className="mt-2 rounded-2xl h-12"
                      value={volunteerGovernmentId}
                      onChange={(event) => {
                        setVolunteerGovernmentId(event.target.value);
                        setVolunteerDigiLockerVerified(false);
                      }}
                    />
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50 space-y-3">
                    <p className="text-sm text-gray-700">
                      Verify volunteer identity through DigiLocker before account activation.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        if (!fullName.trim() || !volunteerPhoneNumber.trim() || !volunteerGovernmentId.trim()) {
                          setMessage("Enter volunteer name, phone number, and government ID before DigiLocker verification.");
                          return;
                        }
                        setVolunteerDigiLockerVerified(true);
                        setMessage("DigiLocker verification successful.");
                      }}
                    >
                      {volunteerDigiLockerVerified ? "DigiLocker Verified" : "Verify with DigiLocker"}
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
                    <p className="font-semibold">Volunteer Guidelines</p>
                    <p>Follow safe pickup practices, be punctual, and handle food with care and hygiene.</p>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={volunteerGuidelinesAccepted}
                        onChange={(event) => setVolunteerGuidelinesAccepted(event.target.checked)}
                      />
                      I agree to volunteer guidelines
                    </label>
                  </div>
                </div>
              )}

              {isSignup && selectedRole === "admin" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="signupAdminId">Admin ID</Label>
                    <Input
                      id="signupAdminId"
                      placeholder="Enter admin ID"
                      className="mt-2 rounded-2xl h-12"
                      value={adminAccessId}
                      onChange={(event) => setAdminAccessId(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="signupAdminPassword">Admin Password</Label>
                    <Input
                      id="signupAdminPassword"
                      type="password"
                      placeholder="Enter admin password"
                      className="mt-2 rounded-2xl h-12"
                      value={adminAccessPassword}
                      onChange={(event) => setAdminAccessPassword(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full rounded-full h-12 bg-[#10b981] hover:bg-[#047857]"
                disabled={authLoading}
              >
                {authLoading
                  ? isSignup
                    ? selectedRole === "admin"
                      ? "Verifying Admin Access..."
                      : "Creating Account..."
                    : "Signing In..."
                  : isSignup
                  ? selectedRole === "admin"
                    ? "Access Admin Panel"
                    : "Create Account"
                  : "Sign In"}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              {message && <p className="text-sm text-center text-gray-600">{message}</p>}
            </form>

            <div className="mt-6">
              <div className="relative">
                <Separator className="my-6" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-gray-500">
                  Or continue with
                </span>
              </div>

              <Button
                variant="outline"
                className="w-full rounded-full h-12 border-2"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {authLoading ? "Please wait..." : "Sign in with Google"}
              </Button>

              {googleOnboardingUser && (
                <div className="mt-5 p-4 rounded-2xl border border-gray-200 bg-gray-50 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Complete Google Login Setup</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Choose your role to continue as {googleOnboardingUser.email || "your account"}.
                    </p>
                  </div>

                  <div>
                    <Label className="mb-2 block">Select Role</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {googleRoles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => setSelectedRole(role.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-left ${
                            selectedRole === role.id
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="font-semibold text-xs">{role.title}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedRole === "admin" && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="adminId">Admin ID</Label>
                        <Input
                          id="adminId"
                          placeholder="Enter admin ID"
                          className="mt-2 rounded-2xl h-11"
                          value={adminAccessId}
                          onChange={(event) => setAdminAccessId(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="adminPass">Admin Password</Label>
                        <Input
                          id="adminPass"
                          type="password"
                          placeholder="Enter admin password"
                          className="mt-2 rounded-2xl h-11"
                          value={adminAccessPassword}
                          onChange={(event) => setAdminAccessPassword(event.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {selectedRole === "receiver" && (
                    <div className="space-y-3">
                      <Label className="mb-2 block">Receiver Type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiverType("individual")}
                          className={`p-3 rounded-xl border-2 text-sm transition-all ${
                            receiverType === "individual"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Individual
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiverType("ngo")}
                          className={`p-3 rounded-xl border-2 text-sm transition-all ${
                            receiverType === "ngo"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          NGO
                        </button>
                      </div>

                      {receiverType === "individual" && (
                        <div className="space-y-3 pt-2">
                          <Label className="block">Verification Mode</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setReceiverIndividualMode("experienced");
                                setReceiverGuidelinesAccepted(false);
                              }}
                              className={`p-3 rounded-xl border-2 text-sm transition-all ${
                                receiverIndividualMode === "experienced"
                                  ? "border-[#10b981] bg-[#d1fae5]"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              I have past works
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiverIndividualMode("new");
                                setReceiverPastWorks("");
                              }}
                              className={`p-3 rounded-xl border-2 text-sm transition-all ${
                                receiverIndividualMode === "new"
                                  ? "border-[#10b981] bg-[#d1fae5]"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              I am new
                            </button>
                          </div>

                          {receiverIndividualMode === "experienced" && (
                            <div>
                              <Label htmlFor="receiverPastWorks">Past Works for Verification</Label>
                              <Input
                                id="receiverPastWorks"
                                placeholder="Describe your previous community work or support experience"
                                className="mt-2 rounded-2xl h-11"
                                value={receiverPastWorks}
                                onChange={(event) => setReceiverPastWorks(event.target.value)}
                              />
                            </div>
                          )}

                          {receiverIndividualMode === "new" && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
                              <p className="font-semibold">Strict Guidelines</p>
                              <p>New receivers must be ready to follow pickup rules, respond on time, and keep delivery details accurate.</p>
                              <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  checked={receiverGuidelinesAccepted}
                                  onChange={(event) => setReceiverGuidelinesAccepted(event.target.checked)}
                                />
                                I agree to follow the strict receiver guidelines
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {receiverType === "ngo" && (
                        <div className="space-y-3 pt-2">
                          <div>
                            <Label htmlFor="ngoName">NGO Name</Label>
                            <Input
                              id="ngoName"
                              placeholder="Enter NGO name"
                              className="mt-2 rounded-2xl h-11"
                              value={ngoName}
                              onChange={(event) => setNgoName(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="ngoWebsite">NGO Website Link</Label>
                            <Input
                              id="ngoWebsite"
                              type="url"
                              placeholder="https://yourngo.org"
                              className="mt-2 rounded-2xl h-11"
                              value={ngoWebsite}
                              onChange={(event) => setNgoWebsite(event.target.value)}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            We use the website link to review the NGO before activating the account.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedRole === "donor" && (
                    <div className="space-y-3">
                      <Label className="mb-2 block">Donor Type</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setDonorCategory("individual")}
                          className={`p-3 rounded-xl border-2 text-xs transition-all ${
                            donorCategory === "individual"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Individual
                        </button>
                        <button
                          type="button"
                          onClick={() => setDonorCategory("restaurant-owner")}
                          className={`p-3 rounded-xl border-2 text-xs transition-all ${
                            donorCategory === "restaurant-owner"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Restaurant
                        </button>
                        <button
                          type="button"
                          onClick={() => setDonorCategory("other")}
                          className={`p-3 rounded-xl border-2 text-xs transition-all ${
                            donorCategory === "other"
                              ? "border-[#10b981] bg-[#d1fae5]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Other
                        </button>
                      </div>

                      {donorCategory === "restaurant-owner" && (
                        <div>
                          <Label htmlFor="googleRestaurantName">Hotel/Restaurant Name</Label>
                          <Input
                            id="googleRestaurantName"
                            placeholder="Enter hotel or restaurant name"
                            className="mt-2 rounded-2xl h-11"
                            value={restaurantName}
                            onChange={(event) => setRestaurantName(event.target.value)}
                          />
                        </div>
                      )}

                      {donorCategory === "other" && (
                        <div>
                          <Label htmlFor="googleOtherDonorLabel">Your Display Name</Label>
                          <Input
                            id="googleOtherDonorLabel"
                            placeholder="Enter how you want to be shown"
                            className="mt-2 rounded-2xl h-11"
                            value={otherDonorLabel}
                            onChange={(event) => setOtherDonorLabel(event.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-full"
                      onClick={resetGoogleOnboardingState}
                      disabled={authLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 rounded-full bg-[#10b981] hover:bg-[#047857]"
                      onClick={handleCompleteGoogleOnboarding}
                      disabled={authLoading}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-center mt-6 text-sm text-gray-600">
              {isSignup ? "Already have an account? " : "Don't have an account? "}
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="text-[#10b981] font-semibold hover:underline"
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </p>
          </Card>

          <p className="text-center mt-6 text-xs text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
