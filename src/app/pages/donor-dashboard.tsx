import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { NotificationBell } from "../components/notification-bell";
import { GlobalSidebar } from "../components/global-sidebar";
import { DashboardLayout } from "../components/dashboard-layout";
import { 
  Home, 
  Upload, 
  TrendingUp, 
  Clock, 
  Utensils,
  Settings,
  User,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Search,
  Building2,
  Globe,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth, db } from "../../firebase/config";
import { sendNotification } from "../lib/notifications";
import { verifyIndianGovernmentIdentity } from "../lib/india-verification";

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
  createdAt?: { toDate?: () => Date };
  donorUid?: string;
  donorEmail?: string;
  claimedByName?: string;
  claimedByType?: "ngo" | "individual";
  claimedByProfileLabel?: string;
  claimedProofImages?: string[];
  claimedProofDescription?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
};

type NGOProfile = {
  id: string;
  name: string;
  email: string;
  website: string;
  taskSummary: string;
  tags: string[];
};

type ReportableProfile = {
  id: string;
  name: string;
  email: string;
  targetType: "ngo" | "individual";
};

type VerificationStatus = "pending" | "verified" | "rejected";
type DonorCategory = "individual" | "restaurant-owner" | "other";

type AddressSuggestion = {
  id: string;
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  latitude: number | null;
  longitude: number | null;
};

const RAPIDAPI_HOST = "google-map-places-new-v2.p.rapidapi.com";
const RAPIDAPI_AUTOCOMPLETE_ENDPOINT = `https://${RAPIDAPI_HOST}/v1/places/autocomplete`;
const RAPIDAPI_PLACE_DETAILS_ENDPOINT = (placeId: string) =>
  `https://${RAPIDAPI_HOST}/v1/places/${encodeURIComponent(placeId)}`;
const MAX_DONATION_IMAGE_DIMENSION = 1280;
const TARGET_DONATION_IMAGE_BYTES = 220 * 1024;
const MAX_DONATION_IMAGE_BYTES = 420 * 1024;

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("donation-image-read-failed"));
    };
    reader.onerror = () => reject(new Error("donation-image-read-failed"));
    reader.readAsDataURL(blob);
  });

const loadImageElement = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("donation-image-load-failed"));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("donation-image-encode-failed"));
      },
      "image/jpeg",
      quality
    );
  });

const optimizeDonationImage = async (file: File): Promise<string> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const largestSide = Math.max(image.width, image.height);
    const scale = largestSide > MAX_DONATION_IMAGE_DIMENSION ? MAX_DONATION_IMAGE_DIMENSION / largestSide : 1;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("donation-image-canvas-unavailable");
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    let encodedBlob = await canvasToBlob(canvas, 0.82);
    let quality = 0.82;
    while (encodedBlob.size > TARGET_DONATION_IMAGE_BYTES && quality > 0.45) {
      quality = Math.max(0.45, quality - 0.1);
      encodedBlob = await canvasToBlob(canvas, quality);
    }

    return await readBlobAsDataUrl(encodedBlob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const normalizeTextValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const nestedText = (value as { text?: unknown }).text;
    if (typeof nestedText === "string") {
      return nestedText.trim();
    }

    const nestedDisplay = (value as { displayName?: unknown }).displayName;
    if (typeof nestedDisplay === "string") {
      return nestedDisplay.trim();
    }
  }

  return "";
};

const normalizeNumericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const extractCoordinates = (value: any): { latitude: number | null; longitude: number | null } => {
  const latitude =
    normalizeNumericValue(value?.location?.latitude) ??
    normalizeNumericValue(value?.location?.lat) ??
    normalizeNumericValue(value?.latLng?.latitude) ??
    normalizeNumericValue(value?.geometry?.location?.lat?.()) ??
    normalizeNumericValue(value?.geometry?.location?.lat) ??
    normalizeNumericValue(value?.latitude) ??
    normalizeNumericValue(value?.lat) ??
    normalizeNumericValue(value?.y);

  const longitude =
    normalizeNumericValue(value?.location?.longitude) ??
    normalizeNumericValue(value?.location?.lng) ??
    normalizeNumericValue(value?.latLng?.longitude) ??
    normalizeNumericValue(value?.geometry?.location?.lng?.()) ??
    normalizeNumericValue(value?.geometry?.location?.lng) ??
    normalizeNumericValue(value?.longitude) ??
    normalizeNumericValue(value?.lng) ??
    normalizeNumericValue(value?.x);

  return { latitude, longitude };
};

const normalizeAddressSuggestions = (payload: any): AddressSuggestion[] => {
  const rawSuggestions = Array.isArray(payload?.suggestions)
    ? payload.suggestions
    : Array.isArray(payload?.predictions)
      ? payload.predictions
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

  return rawSuggestions
    .map((suggestion: any, index: number) => {
      const prediction = suggestion?.placePrediction ?? suggestion?.place_prediction ?? suggestion?.prediction ?? suggestion;
      const mainText =
        normalizeTextValue(prediction?.structuredFormat?.mainText) ||
        normalizeTextValue(prediction?.structured_format?.mainText) ||
        normalizeTextValue(prediction?.structuredFormatting?.mainText) ||
        normalizeTextValue(prediction?.structuredFormatting?.mainText?.text) ||
        normalizeTextValue(prediction?.text) ||
        normalizeTextValue(prediction?.description) ||
        normalizeTextValue(prediction?.formattedAddress) ||
        normalizeTextValue(prediction?.formatted_address) ||
        normalizeTextValue(prediction?.name) ||
        "Suggested address";

      const secondaryText =
        normalizeTextValue(prediction?.structuredFormat?.secondaryText) ||
        normalizeTextValue(prediction?.structured_format?.secondaryText) ||
        normalizeTextValue(prediction?.secondaryText) ||
        normalizeTextValue(prediction?.secondary_text) ||
        "";

      const fullText =
        normalizeTextValue(prediction?.text) ||
        normalizeTextValue(prediction?.description) ||
        normalizeTextValue(prediction?.formattedAddress) ||
        normalizeTextValue(prediction?.formatted_address) ||
        [mainText, secondaryText].filter(Boolean).join(", ") ||
        mainText;

      const placeId =
        normalizeTextValue(prediction?.placeId) ||
        normalizeTextValue(prediction?.place_id) ||
        normalizeTextValue(prediction?.id) ||
        `suggestion-${index}`;

      const coordinates = extractCoordinates(prediction);

      return {
        id: placeId,
        placeId,
        mainText,
        secondaryText,
        fullText,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
    })
    .filter((suggestion: AddressSuggestion) => suggestion.fullText || suggestion.mainText);
};

const normalizeVerificationStatus = (value: unknown): VerificationStatus => {
  if (value === "verified" || value === "rejected") {
    return value;
  }
  return "pending";
};

export function DonorDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [foodType, setFoodType] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [urgency, setUrgency] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDonationsLoading, setIsDonationsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [donationActionMessage, setDonationActionMessage] = useState("");
  const [deletingDonationId, setDeletingDonationId] = useState<string | null>(null);
  const [myDonations, setMyDonations] = useState<Donation[]>([]);
  const [donorName, setDonorName] = useState("Donor");
  const [donorGreetingName, setDonorGreetingName] = useState("Donor");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [ngoProfiles, setNgoProfiles] = useState<NGOProfile[]>([]);
  const [ngoSearchQuery, setNgoSearchQuery] = useState("");
  const [ngoTaskFilter, setNgoTaskFilter] = useState("all");
  const [shortlistedNgoIds, setShortlistedNgoIds] = useState<string[]>([]);
  const [isNgoLoading, setIsNgoLoading] = useState(true);
  const [reportableProfiles, setReportableProfiles] = useState<ReportableProfile[]>([]);
  const [reportTargetType, setReportTargetType] = useState<"ngo" | "individual">("ngo");
  const [reportEntityId, setReportEntityId] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [isRoleSwitching, setIsRoleSwitching] = useState(false);
  const [roleSwitchMessage, setRoleSwitchMessage] = useState("");
  const [isProofViewerOpen, setIsProofViewerOpen] = useState(false);
  const [donationImage, setDonationImage] = useState("");
  const [selectedProofImages, setSelectedProofImages] = useState<string[]>([]);
  const [selectedProofDonationName, setSelectedProofDonationName] = useState("");
  const [selectedProofReceiverLabel, setSelectedProofReceiverLabel] = useState("");
  const [selectedProofDescription, setSelectedProofDescription] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("pending");
  const [donorGovernmentId, setDonorGovernmentId] = useState("");
  const [donorDigiLockerVerified, setDonorDigiLockerVerified] = useState(false);
  const [donorVerifiedAt, setDonorVerifiedAt] = useState<{ toDate?: () => Date } | undefined>(undefined);
  const [donorVerificationLoading, setDonorVerificationLoading] = useState(false);
  const [donorCategory, setDonorCategory] = useState<DonorCategory | null>(null);
  const [donorLocation, setDonorLocation] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [houseName, setHouseName] = useState("");
  const [pickupLatitude, setPickupLatitude] = useState<number | null>(null);
  const [pickupLongitude, setPickupLongitude] = useState<number | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressSuggestionsLoading, setIsAddressSuggestionsLoading] = useState(false);
  const [addressLookupMessage, setAddressLookupMessage] = useState("");
  const addressRequestIdRef = useRef(0);
  const confirmedAddressRef = useRef("");

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const tab = query.get("tab");
    const requestedVerification = query.get("verification") === "1";
    const validTabs = ["overview", "history", "donate", "analytics", "ngos", "settings"];

    if (requestedVerification || tab === "settings") {
      setActiveTab("settings");
      if (requestedVerification) {
        setSettingsMessage("Please complete your donor verification first.");
      }
      return;
    }

    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    const query = address.trim();
    const rapidApiKey = (import.meta as any).env?.VITE_RAPIDAPI_KEY as string | undefined;

    if (!rapidApiKey || query.length < 3 || query === confirmedAddressRef.current) {
      setAddressSuggestions([]);
      setIsAddressSuggestionsLoading(false);
      setAddressLookupMessage("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const requestId = addressRequestIdRef.current + 1;
      addressRequestIdRef.current = requestId;
      setIsAddressSuggestionsLoading(true);
      setAddressLookupMessage("");

      fetch(RAPIDAPI_AUTOCOMPLETE_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": rapidApiKey,
        },
        body: JSON.stringify({
          input: query,
          languageCode: "en",
          regionCode: "us",
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`autocomplete-request-failed:${response.status}`);
          }

          return response.json();
        })
        .then((payload) => {
          if (addressRequestIdRef.current !== requestId) {
            return;
          }

          const nextSuggestions = normalizeAddressSuggestions(payload).slice(0, 6);
          setAddressSuggestions(nextSuggestions);
          setAddressLookupMessage(nextSuggestions.length > 0 ? "" : "No address suggestions found.");
        })
        .catch(() => {
          if (addressRequestIdRef.current !== requestId) {
            return;
          }

          setAddressSuggestions([]);
          setAddressLookupMessage("Could not load address suggestions right now.");
        })
        .finally(() => {
          if (addressRequestIdRef.current === requestId) {
            setIsAddressSuggestionsLoading(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [address]);

  const handleAddressChange = (nextAddress: string) => {
    confirmedAddressRef.current = "";
    setAddress(nextAddress);
    setPickupLatitude(null);
    setPickupLongitude(null);
    setAddressLookupMessage("");
  };

  const handleAddressSuggestionSelected = async (suggestion: AddressSuggestion) => {
    const nextAddress = suggestion.fullText || suggestion.mainText;
    confirmedAddressRef.current = nextAddress;
    setAddress(nextAddress);
    setAddressSuggestions([]);
    setAddressLookupMessage("");

    if (suggestion.latitude !== null && suggestion.longitude !== null) {
      setPickupLatitude(suggestion.latitude);
      setPickupLongitude(suggestion.longitude);
    }

    if (!suggestion.placeId) {
      return;
    }

    const rapidApiKey = (import.meta as any).env?.VITE_RAPIDAPI_KEY as string | undefined;
    if (!rapidApiKey) {
      return;
    }

    try {
      const response = await fetch(RAPIDAPI_PLACE_DETAILS_ENDPOINT(suggestion.placeId), {
        method: "GET",
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": rapidApiKey,
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const place = payload?.place ?? payload?.result ?? payload;
      const formattedAddress =
        normalizeTextValue(place?.formattedAddress) ||
        normalizeTextValue(place?.formatted_address) ||
        normalizeTextValue(place?.address) ||
        nextAddress;

      const coordinates =
        extractCoordinates(place?.location ?? place?.geometry?.location ?? place?.coordinates ?? place)
        ?? { latitude: null, longitude: null };

      setAddress(formattedAddress);
      confirmedAddressRef.current = formattedAddress;

      if (coordinates.latitude !== null && coordinates.longitude !== null) {
        setPickupLatitude(coordinates.latitude);
        setPickupLongitude(coordinates.longitude);
      }
    } catch {
      if (suggestion.latitude === null || suggestion.longitude === null) {
        setAddressLookupMessage("Saved the address text, but coordinates could not be loaded.");
      }
    }
  };

  const composeIndividualPickupAddress = (nextHouseNumber?: string, nextHouseName?: string) => {
    return [
      (nextHouseNumber ?? houseNumber).trim(),
      (nextHouseName ?? houseName).trim(),
      donorLocation.trim(),
    ]
      .filter(Boolean)
      .join(", ");
  };

  useEffect(() => {
    if (donorCategory !== "individual") {
      return;
    }

    const nextAddress = composeIndividualPickupAddress();
    setAddress(nextAddress);
  }, [donorCategory, donorLocation]);

  const resolveCoordinatesFromAddress = async (
    rawAddress: string
  ): Promise<{ address: string; latitude: number | null; longitude: number | null } | null> => {
    const rapidApiKey = (import.meta as any).env?.VITE_RAPIDAPI_KEY as string | undefined;
    const addressQuery = rawAddress.trim();
    if (!rapidApiKey || !addressQuery) {
      return null;
    }

    try {
      const autocompleteResponse = await fetch(RAPIDAPI_AUTOCOMPLETE_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": rapidApiKey,
        },
        body: JSON.stringify({
          input: addressQuery,
          languageCode: "en",
          regionCode: "us",
        }),
      });

      if (!autocompleteResponse.ok) {
        return null;
      }

      const autocompletePayload = await autocompleteResponse.json();
      const firstSuggestion = normalizeAddressSuggestions(autocompletePayload)[0];
      if (!firstSuggestion) {
        return null;
      }

      let nextAddress = firstSuggestion.fullText || firstSuggestion.mainText || addressQuery;
      let nextLatitude = firstSuggestion.latitude;
      let nextLongitude = firstSuggestion.longitude;

      if ((nextLatitude === null || nextLongitude === null) && firstSuggestion.placeId) {
        const detailsResponse = await fetch(RAPIDAPI_PLACE_DETAILS_ENDPOINT(firstSuggestion.placeId), {
          method: "GET",
          headers: {
            "x-rapidapi-host": RAPIDAPI_HOST,
            "x-rapidapi-key": rapidApiKey,
          },
        });

        if (detailsResponse.ok) {
          const detailsPayload = await detailsResponse.json();
          const place = detailsPayload?.place ?? detailsPayload?.result ?? detailsPayload;
          nextAddress =
            normalizeTextValue(place?.formattedAddress) ||
            normalizeTextValue(place?.formatted_address) ||
            normalizeTextValue(place?.address) ||
            nextAddress;

          const coordinates = extractCoordinates(place?.location ?? place?.geometry?.location ?? place?.coordinates ?? place);
          nextLatitude = coordinates.latitude;
          nextLongitude = coordinates.longitude;
        }
      }

      return {
        address: nextAddress,
        latitude: nextLatitude,
        longitude: nextLongitude,
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadProfileName = async () => {
      const user = auth.currentUser;
      if (!user) {
        setDonorName("Donor");
        setDonorGreetingName("Donor");
        return;
      }

      const fallbackName = user.displayName?.trim() || user.email?.split("@")[0] || "Donor";
      setDonorName(fallbackName);
      setDonorGreetingName(fallbackName);

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const fullName = userDoc.exists() ? userDoc.data()?.fullName : "";
        const donorDisplayName = userDoc.exists() ? userDoc.data()?.donorDisplayName : "";
        const donorCategoryFromDb = userDoc.exists() ? userDoc.data()?.donorCategory : null;
        const donorLocationFromDb = userDoc.exists() ? userDoc.data()?.donorLocation : "";
        const donorGovernmentIdFromDb = userDoc.exists() ? userDoc.data()?.donorGovernmentId : "";
        const donorDigiLockerVerifiedFromDb = userDoc.exists() ? userDoc.data()?.donorDigiLockerVerified : false;
        const donorVerifiedAtFromDb = userDoc.exists() ? userDoc.data()?.donorVerifiedAt : undefined;
        const photoFromDb = userDoc.exists() ? userDoc.data()?.photoURL : "";
        const phoneFromDb = userDoc.exists() ? userDoc.data()?.phoneNumber : "";
        const verificationFromDb = userDoc.exists() ? userDoc.data()?.verificationStatus : "pending";

        if (typeof donorDisplayName === "string" && donorDisplayName.trim()) {
          setDonorGreetingName(donorDisplayName.trim());
        } else if (typeof fullName === "string" && fullName.trim()) {
          setDonorGreetingName(fullName.trim());
        }

        if (typeof fullName === "string" && fullName.trim()) {
          setDonorName(fullName.trim());
        }
        if (typeof photoFromDb === "string") {
          setProfilePhotoUrl(photoFromDb);
        }
        if (typeof phoneFromDb === "string") {
          setPhoneNumber(phoneFromDb);
        }
        if (donorCategoryFromDb === "individual" || donorCategoryFromDb === "restaurant-owner" || donorCategoryFromDb === "other") {
          setDonorCategory(donorCategoryFromDb);
        }
        if (typeof donorLocationFromDb === "string") {
          const normalizedLocation = donorLocationFromDb.trim();
          setDonorLocation(normalizedLocation);
          if (donorCategoryFromDb === "restaurant-owner" && normalizedLocation) {
            setAddress(normalizedLocation);
            confirmedAddressRef.current = normalizedLocation;
          }
        }
        if (typeof donorGovernmentIdFromDb === "string") {
          setDonorGovernmentId(donorGovernmentIdFromDb.trim());
        }
        setDonorDigiLockerVerified(Boolean(donorDigiLockerVerifiedFromDb));
        setDonorVerifiedAt(
          donorVerifiedAtFromDb && typeof donorVerifiedAtFromDb.toDate === "function"
            ? donorVerifiedAtFromDb
            : undefined
        );
        setVerificationStatus(normalizeVerificationStatus(verificationFromDb));
      } catch {
        // Keep fallback behavior below when profile lookup fails.
      }

      if (user.photoURL && !profilePhotoUrl) {
        setProfilePhotoUrl(user.photoURL);
      }
    };

    loadProfileName();
  }, []);

  const timeBasedGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    }
    if (hour < 17) {
      return "Good afternoon";
    }
    return "Good evening";
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("donor-theme");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("donor-shortlisted-ngos");
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setShortlistedNgoIds(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      // Keep empty shortlist when local storage is unavailable or malformed.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("donor-theme", themeMode);
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    const donationsRef = collection(db, "donations");
    const unsubscribe = onSnapshot(
      donationsRef,
      (snapshot) => {
        const donations = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            foodName: data.foodName || "",
            quantity: data.quantity || "",
            foodType: data.foodType || "",
            expiryTime: data.expiryTime || "",
            urgency: data.urgency || "",
            address: data.address || "",
            image: typeof data.image === "string" ? data.image : "",
            claimed: data.claimed || false,
            createdAt: data.createdAt,
            donorUid: data.donorUid,
            donorEmail: data.donorEmail,
            claimedByName: data.claimedByName,
            claimedByType: data.claimedByType,
            claimedByProfileLabel: data.claimedByProfileLabel,
            claimedProofImages: Array.isArray(data.claimedProofImages)
              ? data.claimedProofImages.filter((url: unknown) => typeof url === "string")
              : [],
            claimedProofDescription: typeof data.claimedProofDescription === "string" ? data.claimedProofDescription : "",
          } as Donation;
        });

        const currentUserUid = auth.currentUser?.uid;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();
        const donationsForCurrentUser = donations
          .filter((donation) => {
            if (currentUserUid) {
              return donation.donorUid === currentUserUid;
            }
            if (currentUserEmail) {
              return (donation.donorEmail || "").toLowerCase() === currentUserEmail;
            }
            return false;
          })
          .sort((a, b) => {
            const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
            const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
            return timeB - timeA;
          });

        setMyDonations(donationsForCurrentUser);
        setIsDonationsLoading(false);
      },
      () => {
        setIsDonationsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const ngoUsers = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter((userData: any) => userData.role === "receiver" && userData.receiverType === "ngo")
          .map((ngoData: any) => {
            const name = typeof ngoData.ngoName === "string" && ngoData.ngoName.trim()
              ? ngoData.ngoName.trim()
              : typeof ngoData.fullName === "string" && ngoData.fullName.trim()
              ? ngoData.fullName.trim()
              : "NGO";

            const taskSummary: string = typeof ngoData.receiverPastWorks === "string" && ngoData.receiverPastWorks.trim()
              ? ngoData.receiverPastWorks.trim()
              : "General community food support and distribution";

            const explicitTags = Array.isArray(ngoData.ngoFocusAreas)
              ? ngoData.ngoFocusAreas.filter((tag: unknown) => typeof tag === "string")
              : [];

            const derivedTags = taskSummary
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((word: string) => word.length > 3)
              .slice(0, 6);

            const tags = Array.from(new Set([...explicitTags, ...derivedTags]));

            return {
              id: ngoData.id,
              name,
              email: typeof ngoData.email === "string" ? ngoData.email : "",
              website: typeof ngoData.ngoWebsite === "string" ? ngoData.ngoWebsite : "",
              taskSummary,
              tags,
            } as NGOProfile;
          });

        const reportTargets = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter(
            (userData: any) =>
              userData.role === "receiver" &&
              (userData.receiverType === "ngo" || userData.receiverType === "individual")
          )
          .map((userData: any) => {
            const fallbackName = typeof userData.fullName === "string" && userData.fullName.trim()
              ? userData.fullName.trim()
              : typeof userData.email === "string" && userData.email.trim()
              ? userData.email.trim().split("@")[0]
              : "User";

            const name =
              userData.receiverType === "ngo"
                ? typeof userData.ngoName === "string" && userData.ngoName.trim()
                  ? userData.ngoName.trim()
                  : fallbackName
                : fallbackName;

            return {
              id: userData.id,
              name,
              email: typeof userData.email === "string" ? userData.email : "",
              targetType: userData.receiverType === "ngo" ? "ngo" : "individual",
            } as ReportableProfile;
          });

        setNgoProfiles(ngoUsers);
        setReportableProfiles(reportTargets);
        setIsNgoLoading(false);
      },
      () => {
        setIsNgoLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const recentDonations = useMemo(() => myDonations.slice(0, 5), [myDonations]);

  const totalDonations = useMemo(() => myDonations.length, [myDonations]);

  const mealsSaved = useMemo(() => {
    return myDonations.reduce((sum, donation) => {
      const parsed = parseInt(donation.quantity, 10);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [myDonations]);

  const activeDonations = useMemo(
    () => myDonations.filter((donation) => !donation.claimed).length,
    [myDonations]
  );

  const successRate = useMemo(() => {
    if (!totalDonations) {
      return 0;
    }
    const claimed = myDonations.filter((donation) => donation.claimed).length;
    return Math.round((claimed / totalDonations) * 100);
  }, [myDonations, totalDonations]);

  const analyticsData = useMemo(() => {
    const map = new Map<string, number>();
    myDonations.forEach((donation) => {
      const createdDate = donation.createdAt?.toDate?.();
      if (!createdDate) {
        return;
      }
      const month = createdDate.toLocaleString("en-US", { month: "short" });
      map.set(month, (map.get(month) || 0) + 1);
    });

    return Array.from(map.entries()).map(([month, donations]) => ({ month, donations }));
  }, [myDonations]);

  const impactSummary = useMemo(() => {
    const totalWeightKg = myDonations.reduce((sum, donation) => {
      const parsed = parseInt(donation.quantity, 10);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    return {
      totalWeightKg,
      co2SavedKg: Math.round(totalWeightKg * 0.5),
      waterSavedL: Math.round(totalWeightKg * 3),
    };
  }, [myDonations]);

  const foodTypeDistribution = useMemo(() => {
    const counts = { veg: 0, nonVeg: 0, vegan: 0 };
    myDonations.forEach((donation) => {
      if (donation.foodType === "veg") {
        counts.veg += 1;
      } else if (donation.foodType === "non-veg") {
        counts.nonVeg += 1;
      } else {
        counts.vegan += 1;
      }
    });
    const total = myDonations.length || 1;
    return {
      veg: Math.round((counts.veg / total) * 100),
      nonVeg: Math.round((counts.nonVeg / total) * 100),
      vegan: Math.round((counts.vegan / total) * 100),
    };
  }, [myDonations]);

  const topReceivers = useMemo(() => {
    const receiverMap = new Map<string, number>();
    myDonations.forEach((donation) => {
      const key = donation.claimed ? "Claimed Receivers" : "Unclaimed";
      receiverMap.set(key, (receiverMap.get(key) || 0) + 1);
    });
    return Array.from(receiverMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [myDonations]);

  const achievementBadges = useMemo(() => {
    return [
      { id: "starter", title: "First Drop", threshold: 1, description: "Post your first donation" },
      { id: "helper", title: "Community Helper", threshold: 10, description: "Reach 10 donations" },
      { id: "champion", title: "Rescue Champion", threshold: 25, description: "Reach 25 donations" },
      { id: "hero", title: "Food Hero", threshold: 50, description: "Reach 50 donations" },
    ];
  }, []);

  const unlockedBadges = useMemo(() => {
    return achievementBadges.filter((badge) => totalDonations >= badge.threshold).length;
  }, [achievementBadges, totalDonations]);

  const ngoTaskSuggestions = useMemo(() => {
    const allTags = ngoProfiles.flatMap((ngo) => ngo.tags);
    const counts = new Map<string, number>();
    allTags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));

    return [
      "all",
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag]) => tag),
    ];
  }, [ngoProfiles]);

  const filteredNgos = useMemo(() => {
    const query = ngoSearchQuery.trim().toLowerCase();
    return ngoProfiles.filter((ngo) => {
      const matchesQuery =
        !query ||
        ngo.name.toLowerCase().includes(query) ||
        ngo.email.toLowerCase().includes(query) ||
        ngo.website.toLowerCase().includes(query) ||
        ngo.taskSummary.toLowerCase().includes(query) ||
        ngo.tags.some((tag) => tag.toLowerCase().includes(query));

      const matchesTask = ngoTaskFilter === "all" || ngo.tags.some((tag) => tag.toLowerCase() === ngoTaskFilter.toLowerCase());

      return matchesQuery && matchesTask;
    });
  }, [ngoProfiles, ngoSearchQuery, ngoTaskFilter]);

  const shortlistedNgos = useMemo(() => {
    if (shortlistedNgoIds.length === 0) {
      return [] as NGOProfile[];
    }

    const shortlistSet = new Set(shortlistedNgoIds);
    return ngoProfiles.filter((ngo) => shortlistSet.has(ngo.id));
  }, [ngoProfiles, shortlistedNgoIds]);

  const reportTargetOptions = useMemo(
    () => reportableProfiles.filter((profile) => profile.targetType === reportTargetType),
    [reportableProfiles, reportTargetType]
  );

  const getReceiverDisplay = (donation: Donation) => {
    if (!donation.claimed) {
      return "-";
    }

    const name = donation.claimedByName || "Receiver";
    const typeLabel = donation.claimedByType === "ngo" ? "NGO" : "Individual";
    return `${name}-${typeLabel}`;
  };

  const formatRelativeTime = (createdAt?: { toDate?: () => Date }) => {
    const date = createdAt?.toDate ? createdAt.toDate() : null;
    if (!date) {
      return "Just now";
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
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

  const formatExactDateTime = (value?: { toDate?: () => Date }) => {
    const date = value?.toDate ? value.toDate() : null;
    if (!date) {
      return "";
    }

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const canSubmitDonation = donorDigiLockerVerified;

  const handleSubmitDonation = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("Please sign in again before listing a donation.");
      return;
    }

    if (!canSubmitDonation) {
      alert("Complete DigiLocker verification in Settings before listing donations.");
      return;
    }

    if (!foodName || !quantity || !foodType || !expiryDate || !expiryTime || !urgency) {
      alert("Please fill in all fields");
      return;
    }

    if (donorCategory === "individual" && (!houseNumber.trim() || !houseName.trim())) {
      alert("Please provide house number and house name for pickup.");
      return;
    }

    let finalAddress = address.trim();
    if (donorCategory === "restaurant-owner" && donorLocation.trim()) {
      finalAddress = donorLocation.trim();
    }
    if (donorCategory === "individual") {
      finalAddress = composeIndividualPickupAddress();
    }

    if (!finalAddress) {
      alert("Please provide a valid pickup address.");
      return;
    }

    let finalPickupLatitude = pickupLatitude;
    let finalPickupLongitude = pickupLongitude;
    if (finalPickupLatitude === null || finalPickupLongitude === null) {
      const resolved = await resolveCoordinatesFromAddress(finalAddress);
      if (resolved) {
        finalAddress = resolved.address;
        finalPickupLatitude = resolved.latitude;
        finalPickupLongitude = resolved.longitude;
        setAddress(finalAddress);
        confirmedAddressRef.current = finalAddress;
      }
    }

    const combinedExpiryDateTime = `${expiryDate}T${expiryTime}`;

    const donationImageBytes = donationImage
      ? new TextEncoder().encode(donationImage).length
      : 0;
    if (donationImageBytes > MAX_DONATION_IMAGE_BYTES) {
      alert("Donation photo is too large. Please choose a smaller image.");
      return;
    }

    setLoading(true);
    try {
      const donationRef = await addDoc(collection(db, "donations"), {
        foodName,
        quantity,
        foodType,
        expiryDate,
        expiryClock: expiryTime,
        expiryTime: combinedExpiryDateTime,
        urgency,
        address: finalAddress,
        pickupLatitude: finalPickupLatitude,
        pickupLongitude: finalPickupLongitude,
        image: donationImage || null,
        donorUid: currentUser.uid,
        donorEmail: currentUser.email || null,
        claimed: false,
        createdAt: serverTimestamp(),
      });

      await Promise.all([
        sendNotification({
          recipientRole: "receiver",
          title: "New donation listed",
          message: `${foodName} is now available for receivers.`,
          source: "donor-dashboard",
          link: "/receiver",
        }),
        sendNotification({
          recipientRole: "volunteer",
          title: "New pickup request available",
          message: `${foodName} has been listed for pickup and delivery.`,
          source: "donor-dashboard",
          link: "/volunteer",
        }),
        sendNotification({
          recipientRole: "admin",
          title: "New donation listed",
          message: `${foodName} was listed by ${currentUser.displayName || currentUser.email || "a donor"}.`,
          source: "donor-dashboard",
          link: "/admin",
        }),
      ]);

      setSuccessMessage("Donation submitted successfully");
      
      // Reset form
      setFoodName("");
      setQuantity("");
      setFoodType("");
      setExpiryDate("");
      setExpiryTime("");
      setUrgency("");
      setAddress("");
      setPickupLatitude(null);
      setPickupLongitude(null);
      setDonationImage("");

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error submitting donation:", error);
      if (error instanceof FirebaseError) {
        if (error.code === "permission-denied") {
          alert("Permission denied while adding listing. Please sign in again.");
          return;
        }

        if (error.code === "resource-exhausted" || error.code === "invalid-argument") {
          alert("Listing data is too large. Use fewer or smaller images and try again.");
          return;
        }
      }

      alert("Error submitting donation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDonationImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const encodedImage = await optimizeDonationImage(file);
      if (encodedImage.startsWith("data:image/")) {
        setDonationImage(encodedImage);
      }
    } catch {
      alert("Could not process this image. Please choose another one.");
    }

    event.target.value = "";
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
          verificationStatus,
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

  const handleVerifyDonorIdentity = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSettingsMessage("Please sign in again to verify Aadhaar.");
      return;
    }

    if (!donorGovernmentId.trim()) {
      setSettingsMessage("Please enter Aadhaar/government ID before verification.");
      return;
    }

    setDonorVerificationLoading(true);
    setSettingsMessage("");
    try {
      const verificationResult = await verifyIndianGovernmentIdentity({
        governmentId: donorGovernmentId.trim(),
        fullName: donorName,
        ngoName: donorCategory === "restaurant-owner" ? donorGreetingName : "",
        ngoWebsite: "",
      });

      const nextStatus: VerificationStatus =
        verificationResult.status === "verified"
          ? "verified"
          : verificationResult.status === "rejected"
            ? "rejected"
            : "pending";

      await setDoc(
        doc(db, "users", user.uid),
        {
          donorGovernmentId: donorGovernmentId.trim(),
          donorDigiLockerVerified: verificationResult.isVerified,
          donorVerificationProvider: verificationResult.provider || "digilocker",
          donorVerificationProviderRef: verificationResult.providerReferenceId || null,
          donorVerificationReason: verificationResult.reason || null,
          donorVerificationRaw: verificationResult.raw || null,
          verificationStatus: nextStatus,
          donorVerifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setDonorDigiLockerVerified(verificationResult.isVerified);
      setVerificationStatus(nextStatus);
      if (verificationResult.isVerified) {
        setDonorVerifiedAt({ toDate: () => new Date() });
      }
      setSettingsMessage(
        verificationResult.isVerified
          ? "Donor Aadhaar verified through DigiLocker."
          : verificationResult.reason || "Verification submitted. Current status is pending review."
      );
    } catch {
      setSettingsMessage("Could not verify donor Aadhaar right now. Please try again.");
    } finally {
      setDonorVerificationLoading(false);
    }
  };

  const handleSubmitReport = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!reportEntityId || !reportReason || !reportDetails.trim()) {
      setReportMessage("Please select who you are reporting and provide complete report details.");
      return;
    }

    const selectedTarget = reportableProfiles.find((profile) => profile.id === reportEntityId);
    if (!selectedTarget) {
      setReportMessage("Selected profile was not found. Please refresh and try again.");
      return;
    }

    setIsReportSubmitting(true);
    setReportMessage("");
    try {
      await addDoc(collection(db, "reports"), {
        reporterUid: auth.currentUser?.uid || null,
        reporterEmail: auth.currentUser?.email || null,
        targetId: selectedTarget.id,
        targetName: selectedTarget.name,
        targetEmail: selectedTarget.email,
        targetType: selectedTarget.targetType,
        reason: reportReason,
        details: reportDetails.trim(),
        source: "donor-dashboard",
        status: "open",
        createdAt: serverTimestamp(),
      });

      await sendNotification({
        recipientRole: "admin",
        title: "New report submitted",
        message: `${auth.currentUser?.displayName || auth.currentUser?.email || "A donor"} reported ${selectedTarget.name}.`,
        source: "donor-dashboard",
        link: "/admin",
      });

      setReportMessage("Report submitted successfully. Our team will review it shortly.");
      setReportEntityId("");
      setReportReason("");
      setReportDetails("");
    } catch {
      setReportMessage("Could not submit the report right now. Please try again.");
    } finally {
      setIsReportSubmitting(false);
    }
  };

  const handleSwitchToVolunteer = async () => {
    const user = auth.currentUser;
    if (!user) {
      setRoleSwitchMessage("Please sign in again to update your role.");
      return;
    }

    const confirmed = window.confirm(
      "Switch your profile from donor to volunteer? You can still access your donation history later from your account data."
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
          role: "volunteer",
          roleSwitchedFrom: "donor",
          verificationStatus,
          roleSwitchedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setRoleSwitchMessage("Profile updated to volunteer. Redirecting...");
      navigate("/volunteer");
    } catch {
      setRoleSwitchMessage("Could not switch role right now. Please try again.");
    } finally {
      setIsRoleSwitching(false);
    }
  };

  const handleToggleNgoShortlist = (ngoId: string) => {
    setShortlistedNgoIds((prev) => {
      const exists = prev.includes(ngoId);
      const next = exists ? prev.filter((id) => id !== ngoId) : [...prev, ngoId];
      localStorage.setItem("donor-shortlisted-ngos", JSON.stringify(next));
      return next;
    });
  };

  const handleOpenProofViewer = (donation: Donation) => {
    const proofImages = donation.claimedProofImages || [];
    setSelectedProofImages(proofImages);
    setSelectedProofDonationName(donation.foodName || "Donation");
    setSelectedProofReceiverLabel(getReceiverDisplay(donation));
    setSelectedProofDescription(donation.claimedProofDescription || "");
    setIsProofViewerOpen(true);
  };

  const handleDeleteDonation = async (donation: Donation) => {
    const currentUid = auth.currentUser?.uid || null;
    const currentEmail = (auth.currentUser?.email || "").toLowerCase();
    const matchesOwnerByUid = currentUid ? donation.donorUid === currentUid : false;
    const matchesOwnerByEmail = currentEmail
      ? (donation.donorEmail || "").toLowerCase() === currentEmail
      : false;

    if (!matchesOwnerByUid && !matchesOwnerByEmail) {
      setDonationActionMessage("You can only delete donations that you listed.");
      return;
    }

    const confirmed = window.confirm(
      `Delete listing for ${donation.foodName || "this donation"}? This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingDonationId(donation.id);
    setDonationActionMessage("");
    try {
      await deleteDoc(doc(db, "donations", donation.id));
      setDonationActionMessage("Donation listing deleted successfully.");
    } catch {
      setDonationActionMessage("Could not delete this donation right now.");
    } finally {
      setDeletingDonationId(null);
    }
  };

  return (
    <>
      <GlobalSidebar role="donor" activeTab={activeTab} onTabChange={setActiveTab} />
      <DashboardLayout>
        {/* Top Bar */}
        <header className={`border-b px-4 md:px-6 lg:px-8 py-2 md:py-4 ${themeMode === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold">Donor Dashboard</h1>
              <p className="text-xs md:text-sm text-gray-600">{timeBasedGreeting}, {donorGreetingName}</p>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <NotificationBell audienceRole="donor" />
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="hidden md:block">
                  <div className="font-medium text-sm">{donorName}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>Donor</span>
                    <Badge
                      className={`rounded-full border-0 shadow-sm px-2 py-0.5 ${
                        verificationStatus === "verified"
                          ? "bg-gradient-to-r from-[#d1fae5] to-[#a7f3d0] text-[#047857]"
                          : verificationStatus === "rejected"
                          ? "bg-gradient-to-r from-[#fee2e2] to-[#fecaca] text-[#991b1b]"
                          : "bg-gradient-to-r from-[#e0e7ff] to-[#dbeafe] text-[#1d4ed8]"
                      }`}
                    >
                      {verificationStatus === "verified"
                        ? "Verified Donor"
                        : verificationStatus === "rejected"
                        ? "Verification Rejected"
                        : "Verification Pending"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {activeTab === "overview" && (
            <div className="space-y-4 md:space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-1 md:gap-6">
                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="flex flex-col items-center mb-2 md:mb-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#d1fae5] flex items-center justify-center mb-1 md:mb-0">
                      <Package className="w-4 h-4 md:w-6 md:h-6 text-[#047857]" />
                    </div>
                  </div>
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{isDonationsLoading ? "-" : totalDonations}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Donations</div>
                </Card>

                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="flex flex-col items-center mb-2 md:mb-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#dbeafe] flex items-center justify-center mb-1 md:mb-0">
                      <Utensils className="w-4 h-4 md:w-6 md:h-6 text-[#1d4ed8]" />
                    </div>
                  </div>
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{isDonationsLoading ? "-" : mealsSaved}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Meals</div>
                </Card>

                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="flex flex-col items-center mb-2 md:mb-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#fed7aa] flex items-center justify-center mb-1 md:mb-0">
                      <Clock className="w-4 h-4 md:w-6 md:h-6 text-[#c2410c]" />
                    </div>
                  </div>
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{isDonationsLoading ? "-" : activeDonations}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Active</div>
                </Card>

                <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
                  <div className="flex flex-col items-center mb-2 md:mb-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#e9d5ff] flex items-center justify-center mb-1 md:mb-0">
                      <CheckCircle2 className="w-4 h-4 md:w-6 md:h-6 text-[#6d28d9]" />
                    </div>
                  </div>
                  <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{isDonationsLoading ? "-" : `${successRate}%`}</div>
                  <div className="text-xs text-gray-600 text-center leading-tight">Success</div>
                </Card>
              </div>

              {/* Recent Donations Table */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Recent Donations</h2>
                  <Button variant="outline" className="rounded-full">View All</Button>
                </div>
                {donationActionMessage && (
                  <div className="mb-4 text-sm text-[#1d4ed8]">{donationActionMessage}</div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Food Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Receiver</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Verify</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDonations.length > 0 ? recentDonations.map((donation) => (
                        <tr key={donation.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 font-medium">{donation.foodName}</td>
                          <td className="py-4 px-4">{donation.quantity}</td>
                          <td className="py-4 px-4">
                            <Badge variant="secondary" className="rounded-full">
                              {donation.foodType === "veg" ? "Veg" : donation.foodType === "non-veg" ? "Non-Veg" : "Vegan"}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <Badge className={`rounded-full ${donation.claimed ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-gray-100 text-gray-600"}`}>
                              {donation.claimed && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {donation.claimed ? "Claimed" : "Available"}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-gray-700">{getReceiverDisplay(donation)}</span>
                          </td>
                          <td className="py-4 px-4">
                            {donation.claimed ? (
                              donation.claimedProofImages && donation.claimedProofImages.length > 0 ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full h-9"
                                  onClick={() => handleOpenProofViewer(donation)}
                                >
                                  Verify Donation
                                </Button>
                              ) : (
                                <span className="text-sm text-gray-500">No proof uploaded</span>
                              )
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full h-9 border-[#ef4444] text-[#b91c1c] hover:bg-[#fee2e2]"
                              disabled={deletingDonationId === donation.id}
                              onClick={() => handleDeleteDonation(donation)}
                            >
                              {deletingDonationId === donation.id ? "Deleting..." : "Delete"}
                            </Button>
                          </td>
                          <td className="py-4 px-4 text-gray-600">{formatRelativeTime(donation.createdAt)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-gray-500">
                            {isDonationsLoading ? "Loading donations..." : "No donations yet"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "history" && (
            <Card className="p-6 rounded-3xl border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">My Donations</h2>
                <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                  {myDonations.length} Total
                </Badge>
              </div>
              {donationActionMessage && (
                <div className="mb-4 text-sm text-[#1d4ed8]">{donationActionMessage}</div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Food Name</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Urgency</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Receiver</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Verify</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Posted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myDonations.length > 0 ? myDonations.map((donation) => (
                      <tr key={donation.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 font-medium">{donation.foodName}</td>
                        <td className="py-4 px-4">{donation.quantity}</td>
                        <td className="py-4 px-4">{donation.foodType === "veg" ? "Veg" : donation.foodType === "non-veg" ? "Non-Veg" : "Vegan"}</td>
                        <td className="py-4 px-4 capitalize">{donation.urgency || "-"}</td>
                        <td className="py-4 px-4">
                          <Badge className={`rounded-full ${donation.claimed ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-gray-100 text-gray-600"}`}>
                            {donation.claimed ? "Claimed" : "Available"}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-gray-700">{getReceiverDisplay(donation)}</span>
                        </td>
                        <td className="py-4 px-4">
                          {donation.claimed ? (
                            donation.claimedProofImages && donation.claimedProofImages.length > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full h-9"
                                onClick={() => handleOpenProofViewer(donation)}
                              >
                                Verify Donation
                              </Button>
                            ) : (
                              <span className="text-sm text-gray-500">No proof uploaded</span>
                            )
                          ) : (
                            <span className="text-sm text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full h-9 border-[#ef4444] text-[#b91c1c] hover:bg-[#fee2e2]"
                            disabled={deletingDonationId === donation.id}
                            onClick={() => handleDeleteDonation(donation)}
                          >
                            {deletingDonationId === donation.id ? "Deleting..." : "Delete"}
                          </Button>
                        </td>
                        <td className="py-4 px-4 text-gray-600">{formatRelativeTime(donation.createdAt)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-gray-500">
                          {isDonationsLoading ? "Loading your donations..." : "No donations found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {activeTab === "donate" && (
            <Card className="p-8 rounded-3xl border-0 shadow-lg max-w-3xl">
              <h2 className="text-2xl font-bold mb-6">Create New Donation</h2>
              {successMessage && (
                <div className="mb-6 p-4 bg-[#d1fae5] text-[#047857] rounded-2xl flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {successMessage}
                </div>
              )}
              <form className="space-y-6" onSubmit={handleSubmitDonation}>
                <div>
                  <Label htmlFor="foodName">Food Name</Label>
                  <Input
                    id="foodName"
                    placeholder="e.g., Fresh Vegetable Mix"
                    className="mt-2 rounded-2xl"
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      placeholder="e.g., 50 kg or 30 meals"
                      className="mt-2 rounded-2xl"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="foodType">Food Type</Label>
                    <Select value={foodType} onValueChange={setFoodType}>
                      <SelectTrigger className="mt-2 rounded-2xl">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="veg">Vegetarian</SelectItem>
                        <SelectItem value="non-veg">Non-Vegetarian</SelectItem>
                        <SelectItem value="vegan">Vegan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <Label htmlFor="expiryDate">Expiry Date</Label>
                    <Input
                      id="expiryDate"
                      type="date"
                      className="mt-2 rounded-2xl"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiryTime">Expiry Time</Label>
                    <Input
                      id="expiryTime"
                      type="time"
                      className="mt-2 rounded-2xl"
                      value={expiryTime}
                      onChange={(e) => setExpiryTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="urgency">Urgency Level</Label>
                    <Select value={urgency} onValueChange={setUrgency}>
                      <SelectTrigger className="mt-2 rounded-2xl">
                        <SelectValue placeholder="Select urgency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low - 24+ hours</SelectItem>
                        <SelectItem value="medium">Medium - 12-24 hours</SelectItem>
                        <SelectItem value="high">High - 6-12 hours</SelectItem>
                        <SelectItem value="urgent">Urgent - &lt;6 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {donorCategory === "individual" && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="houseNumber">House Number</Label>
                      <Input
                        id="houseNumber"
                        placeholder="e.g., 42A"
                        className="mt-2 rounded-2xl h-12"
                        value={houseNumber}
                        onChange={(event) => {
                          const nextHouseNumber = event.target.value;
                          setHouseNumber(nextHouseNumber);
                          const nextAddress = composeIndividualPickupAddress(nextHouseNumber, houseName);
                          confirmedAddressRef.current = "";
                          setAddress(nextAddress);
                          setPickupLatitude(null);
                          setPickupLongitude(null);
                          setAddressLookupMessage("");
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="houseName">House Name</Label>
                      <Input
                        id="houseName"
                        placeholder="e.g., Green Villa"
                        className="mt-2 rounded-2xl h-12"
                        value={houseName}
                        onChange={(event) => {
                          const nextHouseName = event.target.value;
                          setHouseName(nextHouseName);
                          const nextAddress = composeIndividualPickupAddress(houseNumber, nextHouseName);
                          confirmedAddressRef.current = "";
                          setAddress(nextAddress);
                          setPickupLatitude(null);
                          setPickupLongitude(null);
                          setAddressLookupMessage("");
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="address">
                    Pickup Address
                    {donorCategory === "restaurant-owner" ? " (From Login)" : donorCategory === "individual" ? " (Auto-built)" : ""}
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="address"
                      placeholder={
                        donorCategory === "restaurant-owner"
                          ? "Using hotel/restaurant location from profile"
                          : donorCategory === "individual"
                          ? "House address will be generated from details"
                          : "Enter full pickup address"
                      }
                      className="rounded-2xl h-12"
                      value={address}
                      readOnly={(donorCategory === "restaurant-owner" && Boolean(donorLocation.trim())) || donorCategory === "individual"}
                      onChange={(e) => handleAddressChange(e.target.value)}
                    />
                    {(donorCategory !== "individual" && (donorCategory !== "restaurant-owner" || !donorLocation.trim())) && (addressSuggestions.length > 0 || isAddressSuggestionsLoading || addressLookupMessage) && (
                      <div className="absolute z-20 mt-3 w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
                        {isAddressSuggestionsLoading && (
                          <div className="px-4 py-3 text-sm text-gray-500">Searching addresses...</div>
                        )}

                        {!isAddressSuggestionsLoading && addressSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="flex w-full flex-col items-start gap-1 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-[#f8fafc] last:border-b-0"
                            onClick={() => handleAddressSuggestionSelected(suggestion)}
                          >
                            <span className="text-sm font-medium text-gray-900">{suggestion.mainText}</span>
                            {suggestion.secondaryText && (
                              <span className="text-xs text-gray-500">{suggestion.secondaryText}</span>
                            )}
                          </button>
                        ))}

                        {!isAddressSuggestionsLoading && addressSuggestions.length === 0 && addressLookupMessage && (
                          <div className="px-4 py-3 text-sm text-gray-500">{addressLookupMessage}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {donorCategory === "restaurant-owner"
                      ? "Hotel owners use the saved hotel/restaurant location from login; coordinates are resolved automatically."
                      : donorCategory === "individual"
                      ? "Individuals use house number and house name; the full pickup address and coordinates are resolved automatically."
                      : "Start typing to search RapidAPI address suggestions. Select one to store the pickup coordinates."}
                  </p>
                </div>

                <div>
                  <Label htmlFor="donationPhoto">Upload Photo</Label>
                  <input
                    id="donationPhoto"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleDonationImageSelected}
                  />
                  <label htmlFor="donationPhoto" className="mt-2 block border-2 border-dashed border-gray-300 rounded-2xl p-6 md:p-8 text-center hover:border-[#10b981] transition-colors cursor-pointer overflow-hidden">
                    {donationImage ? (
                      <div className="space-y-3">
                        <img
                          src={donationImage}
                          alt="Selected donation preview"
                          className="mx-auto w-full max-w-md h-52 object-cover rounded-2xl border border-gray-200"
                        />
                        <p className="text-sm text-gray-600">Click to replace the selected image</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600">Click to upload an image</p>
                        <p className="text-sm text-gray-500 mt-1">PNG, JPG, JPEG, or WebP</p>
                      </>
                    )}
                  </label>
                  {donationImage && (
                    <p className="text-xs text-gray-500 mt-2">Image selected and ready to save with this donation.</p>
                  )}
                </div>

                <Button 
                  type="submit"
                  className="w-full rounded-full bg-[#10b981] hover:bg-[#047857] h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || !canSubmitDonation}
                >
                  {loading ? "Submitting..." : canSubmitDonation ? "Submit Donation" : "Verify DigiLocker to Submit"}
                </Button>
                {!canSubmitDonation && (
                  <p className="text-xs text-[#b91c1c]">Listing is locked until your DigiLocker identity is verified in Settings.</p>
                )}
              </form>
            </Card>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-6">
              <Card className="p-8 rounded-3xl border-0 shadow-lg">
                <h2 className="text-2xl font-bold mb-6">Donation Analytics</h2>
                {analyticsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={analyticsData}>
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
                      <Bar dataKey="donations" fill="#10b981" radius={[12, 12, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-gray-500">
                    {isDonationsLoading ? "Loading analytics..." : "No donation data yet"}
                  </div>
                )}
              </Card>

              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-semibold mb-4">Impact Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Weight</span>
                      <span className="font-semibold">{impactSummary.totalWeightKg} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">CO₂ Saved</span>
                      <span className="font-semibold">{impactSummary.co2SavedKg} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Water Saved</span>
                      <span className="font-semibold">{impactSummary.waterSavedL} L</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-semibold mb-4">Top Receivers</h3>
                  <div className="space-y-3">
                    {topReceivers.length > 0 ? (
                      topReceivers.map(([name, count]) => (
                        <div key={name} className="flex justify-between">
                          <span className="text-gray-600">{name}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No receiver data yet</div>
                    )}
                  </div>
                </Card>

                <Card className="p-6 rounded-3xl border-0 shadow-lg">
                  <h3 className="font-semibold mb-4">Food Type Distribution</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Vegetarian</span>
                      <span className="font-semibold">{foodTypeDistribution.veg}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Non-Vegetarian</span>
                      <span className="font-semibold">{foodTypeDistribution.nonVeg}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Vegan</span>
                      <span className="font-semibold">{foodTypeDistribution.vegan}%</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "ngos" && (
            <div className="space-y-6">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Find NGOs by Task</h2>
                  <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                    {filteredNgos.length} Match{filteredNgos.length === 1 ? "" : "es"}
                  </Badge>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by NGO, website, or task keyword"
                      className="pl-10 rounded-2xl"
                      value={ngoSearchQuery}
                      onChange={(event) => setNgoSearchQuery(event.target.value)}
                    />
                  </div>

                  <Select value={ngoTaskFilter} onValueChange={setNgoTaskFilter}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Filter by task" />
                    </SelectTrigger>
                    <SelectContent>
                      {ngoTaskSuggestions.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag === "all" ? "All Tasks" : tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ngoTaskSuggestions.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setNgoTaskFilter(tag)}
                      className={`px-3 py-1 rounded-full text-xs transition-all ${
                        ngoTaskFilter === tag
                          ? "bg-[#10b981] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {tag === "all" ? "All" : tag}
                    </button>
                  ))}
                </div>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                {isNgoLoading ? (
                  <Card className="p-6 rounded-3xl border-0 shadow-lg md:col-span-2 text-center text-gray-500">
                    Loading NGOs...
                  </Card>
                ) : filteredNgos.length > 0 ? (
                  filteredNgos.map((ngo) => (
                    <Card key={ngo.id} className="p-6 rounded-3xl border-0 shadow-lg">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold">{ngo.name}</h3>
                          <p className="text-sm text-gray-600">{ngo.email || "No email available"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {shortlistedNgoIds.includes(ngo.id) && (
                            <Badge className="rounded-full bg-[#fef3c7] text-[#92400e]">Shortlisted</Badge>
                          )}
                          <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">NGO</Badge>
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 mb-4">{ngo.taskSummary}</p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {ngo.tags.length > 0 ? (
                          ngo.tags.slice(0, 6).map((tag) => (
                            <Badge key={tag} variant="secondary" className="rounded-full text-xs">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="rounded-full text-xs">general-support</Badge>
                        )}
                      </div>

                      <div className="flex gap-3 flex-wrap">
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setReportTargetType("ngo");
                            setReportEntityId(ngo.id);
                            setReportMessage("Selected NGO in report form.");
                          }}
                        >
                          Report
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => handleToggleNgoShortlist(ngo.id)}
                        >
                          {shortlistedNgoIds.includes(ngo.id) ? "Remove Shortlist" : "Shortlist"}
                        </Button>
                        {ngo.website ? (
                          <a href={ngo.website} target="_blank" rel="noreferrer" className="flex-1">
                            <Button variant="outline" className="w-full rounded-full">
                              <Globe className="w-4 h-4 mr-2" />
                              Open NGO Site
                            </Button>
                          </a>
                        ) : (
                          <Button variant="outline" className="w-full rounded-full" disabled>
                            <Globe className="w-4 h-4 mr-2" />
                            No Website Listed
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card className="p-6 rounded-3xl border-0 shadow-lg md:col-span-2 text-center text-gray-500">
                    No NGOs found for your search. Try another task keyword.
                  </Card>
                )}
              </div>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Shortlisted NGOs</h2>
                  <Badge className="rounded-full bg-[#fef3c7] text-[#92400e]">{shortlistedNgos.length} Saved</Badge>
                </div>
                {shortlistedNgos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {shortlistedNgos.map((ngo) => (
                      <button
                        key={ngo.id}
                        type="button"
                        className="px-3 py-1 rounded-full text-xs bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]"
                        onClick={() => setNgoSearchQuery(ngo.name)}
                      >
                        {ngo.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Shortlist NGOs from results to build your preferred partner list.</div>
                )}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Report NGO or Individual</h2>
                  <Badge className="rounded-full bg-[#fee2e2] text-[#b91c1c]">Safety</Badge>
                </div>

                <form className="space-y-4" onSubmit={handleSubmitReport}>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="reportTargetType">Report Type</Label>
                      <Select
                        value={reportTargetType}
                        onValueChange={(value) => {
                          const nextType = value as "ngo" | "individual";
                          setReportTargetType(nextType);
                          setReportEntityId("");
                        }}
                      >
                        <SelectTrigger id="reportTargetType" className="mt-2 rounded-2xl">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ngo">NGO</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="reportEntity">Select Profile</Label>
                      <Select value={reportEntityId} onValueChange={setReportEntityId}>
                        <SelectTrigger id="reportEntity" className="mt-2 rounded-2xl">
                          <SelectValue placeholder={reportTargetOptions.length ? "Choose profile" : "No profiles found"} />
                        </SelectTrigger>
                        <SelectContent>
                          {reportTargetOptions.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="reportReason">Reason</Label>
                      <Select value={reportReason} onValueChange={setReportReason}>
                        <SelectTrigger id="reportReason" className="mt-2 rounded-2xl">
                          <SelectValue placeholder="Choose reason" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="misleading-info">Misleading Information</SelectItem>
                          <SelectItem value="fraud-scam">Fraud / Scam</SelectItem>
                          <SelectItem value="unsafe-conduct">Unsafe Conduct</SelectItem>
                          <SelectItem value="spam-abuse">Spam / Abuse</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="reportDetails">Details</Label>
                    <Textarea
                      id="reportDetails"
                      className="mt-2 rounded-2xl min-h-[110px]"
                      placeholder="Share what happened, where, and why this should be reviewed..."
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="rounded-full bg-[#ef4444] hover:bg-[#dc2626]"
                    disabled={isReportSubmitting}
                  >
                    {isReportSubmitting ? "Submitting..." : "Submit Report"}
                  </Button>
                </form>

                {reportMessage && (
                  <div className="mt-4 text-sm text-gray-700">{reportMessage}</div>
                )}
              </Card>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl">
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">User Profile</h2>
                <div className="grid md:grid-cols-3 gap-6 items-start">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center overflow-hidden">
                      {profilePhotoUrl ? (
                        <img src={profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-white" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600">Profile Photo Preview</div>
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <Label htmlFor="profilePhoto">Profile Photo URL</Label>
                      <Input
                        id="profilePhoto"
                        placeholder="https://example.com/photo.jpg"
                        className="mt-2 rounded-2xl"
                        value={profilePhotoUrl}
                        onChange={(e) => setProfilePhotoUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        placeholder="+91 9876543210"
                        className="mt-2 rounded-2xl"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleSaveProfileSettings}
                      className="rounded-full bg-[#10b981] hover:bg-[#047857]"
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? "Saving..." : "Save Profile"}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Appearance</h2>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant={themeMode === "light" ? "default" : "outline"}
                    className={`rounded-full ${themeMode === "light" ? "bg-[#10b981] hover:bg-[#047857]" : ""}`}
                    onClick={() => setThemeMode("light")}
                  >
                    Light Mode
                  </Button>
                  <Button
                    type="button"
                    variant={themeMode === "dark" ? "default" : "outline"}
                    className={`rounded-full ${themeMode === "dark" ? "bg-[#0f172a] hover:bg-[#020617] text-white" : ""}`}
                    onClick={() => setThemeMode("dark")}
                  >
                    Dark Mode
                  </Button>
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-5">Security</h2>
                <p className="text-gray-600 mb-4">Send a reset link to your registered email address.</p>
                <Button
                  onClick={handleResetPassword}
                  variant="outline"
                  className="rounded-full"
                  disabled={settingsSaving}
                >
                  Reset Password
                </Button>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-2">Aadhaar Verification</h2>
                <p className="text-gray-600 mb-4">Re-verify donor Aadhaar through DigiLocker for existing accounts.</p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label htmlFor="donorVerificationGovId">Aadhaar / Government ID</Label>
                    <Input
                      id="donorVerificationGovId"
                      className="mt-2 rounded-2xl"
                      placeholder="Enter Aadhaar / Govt ID"
                      value={donorGovernmentId}
                      onChange={(event) => {
                        setDonorGovernmentId(event.target.value);
                        setDonorDigiLockerVerified(false);
                      }}
                    />
                  </div>

                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50">
                    <div className="font-semibold mb-1">Current Status</div>
                    <div className="text-sm text-gray-600">
                      {donorDigiLockerVerified ? "DigiLocker Verified" : "Not Verified"}
                    </div>
                    <div className="font-semibold mt-3 mb-1">Last Verified</div>
                    <div
                      className="text-sm text-gray-600"
                      title={donorVerifiedAt ? formatExactDateTime(donorVerifiedAt) : undefined}
                    >
                      {donorVerifiedAt ? formatRelativeTime(donorVerifiedAt) : "Never"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="rounded-full bg-[#3b82f6] hover:bg-[#1d4ed8]"
                    onClick={handleVerifyDonorIdentity}
                    disabled={donorVerificationLoading}
                  >
                    {donorVerificationLoading ? "Verifying..." : donorDigiLockerVerified ? "Re-verify DigiLocker" : "Verify via DigiLocker"}
                  </Button>
                  {donorDigiLockerVerified && (
                    <Badge className="rounded-full bg-[#dbeafe] text-[#1d4ed8]">Verified</Badge>
                  )}
                </div>
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h2 className="text-xl font-bold mb-2">Profile Role</h2>
                <p className="text-gray-600 mb-4">
                  Want to help with pickup and delivery tasks? Switch your profile from donor to volunteer.
                </p>
                <Button
                  onClick={handleSwitchToVolunteer}
                  className="rounded-full bg-[#f59e0b] hover:bg-[#d97706]"
                  disabled={isRoleSwitching}
                >
                  {isRoleSwitching ? "Switching..." : "Switch to Volunteer"}
                </Button>
                {roleSwitchMessage && <p className="text-sm text-gray-700 mt-3">{roleSwitchMessage}</p>}
              </Card>

              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold">Achievement Badges</h2>
                  <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">
                    {unlockedBadges}/{achievementBadges.length} Unlocked
                  </Badge>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {achievementBadges.map((badge) => {
                    const unlocked = totalDonations >= badge.threshold;
                    return (
                      <div
                        key={badge.id}
                        className={`p-4 rounded-2xl border ${
                          unlocked
                            ? "bg-[#d1fae5] border-[#10b981]"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold">{badge.title}</div>
                          <Badge className={`rounded-full ${unlocked ? "bg-[#10b981] text-white" : "bg-gray-200 text-gray-700"}`}>
                            {unlocked ? "Unlocked" : "Locked"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{badge.description}</p>
                        <p className="text-xs text-gray-500 mt-2">Target: {badge.threshold} donations</p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {settingsMessage && (
                <Card className="p-4 rounded-2xl border-0 shadow-lg bg-[#dbeafe] text-[#1d4ed8]">
                  {settingsMessage}
                </Card>
              )}
            </div>
          )}
        </main>
      </DashboardLayout>

      {isProofViewerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[85vh] overflow-auto p-6 rounded-3xl border-0 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold">Donation Verification</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedProofDonationName} • {selectedProofReceiverLabel}</p>
              </div>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsProofViewerOpen(false)}>
                Close
              </Button>
            </div>

            {selectedProofDescription && (
              <Card className="p-4 rounded-2xl border border-gray-200 mb-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Receiver Description</div>
                <div className="text-sm text-gray-700">{selectedProofDescription}</div>
              </Card>
            )}

            {selectedProofImages.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {selectedProofImages.map((imageUrl, index) => (
                  <a key={`${imageUrl}-${index}`} href={imageUrl} target="_blank" rel="noreferrer" className="block rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow">
                    <img src={imageUrl} alt={`Proof ${index + 1}`} className="w-full h-56 object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No proof images were uploaded for this donation.</div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
