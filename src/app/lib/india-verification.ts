import axios from "axios";

export type IndiaVerificationStatus = "verified" | "pending" | "rejected";

export type IndiaVerificationInput = {
  governmentId: string;
  fullName: string;
  ngoName?: string;
  ngoWebsite?: string;
};

export type IndiaVerificationResult = {
  status: IndiaVerificationStatus;
  provider: string;
  providerReferenceId?: string;
  reason?: string;
  isVerified: boolean;
  raw?: unknown;
};

export type IndiaNgoVerificationInput = {
  ngoName: string;
  ngoWebsite: string;
  documentImage: string;
  contactName?: string;
};

const normalizeStatus = (value: unknown): IndiaVerificationStatus => {
  if (value === "verified" || value === "approved" || value === "success") {
    return "verified";
  }
  if (value === "rejected" || value === "failed" || value === "error") {
    return "rejected";
  }
  return "pending";
};

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_PATTERN = /^[0-9]{12}$/;

const verhoeffD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const verhoeffP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const normalizeGovernmentId = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

const isAadhaarChecksumValid = (aadhaar: string): boolean => {
  if (!AADHAAR_PATTERN.test(aadhaar)) {
    return false;
  }

  let c = 0;
  const digits = aadhaar.split("").reverse().map((digit) => Number.parseInt(digit, 10));
  for (let i = 0; i < digits.length; i += 1) {
    c = verhoeffD[c][verhoeffP[i % 8][digits[i]]];
  }

  return c === 0;
};

const isBackendUnavailableError = (error: any): boolean => {
  const statusCode = error?.response?.status;
  return statusCode === 404 || statusCode === 405 || statusCode === 500 || error?.code === "ERR_NETWORK";
};

const normalizePayloadResult = (payload: any, providerFallback: string): IndiaVerificationResult => {
  const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);
  return {
    status,
    provider: payload?.provider || providerFallback,
    providerReferenceId:
      payload?.providerReferenceId ??
      payload?.referenceId ??
      payload?.reference_id ??
      payload?.transactionId ??
      payload?.requestId ??
      undefined,
    reason: payload?.reason ?? payload?.message ?? undefined,
    isVerified: payload?.isVerified === true || status === "verified",
    raw: payload?.raw ?? payload,
  };
};

const resolveVerificationProxyBaseUrl = () => {
  const configuredBaseUrl = ((import.meta as any).env?.VITE_VERIFICATION_PROXY_BASE_URL as string | undefined)?.trim();
  if (!configuredBaseUrl) {
    return "";
  }

  return configuredBaseUrl.replace(/\/$/, "");
};

const buildProxyUrl = (path: string) => {
  const baseUrl = resolveVerificationProxyBaseUrl();
  return `${baseUrl}${path}`;
};

// NOTE: Frontend API keys are visible in the browser. Move this call to a backend/Cloud Function for production.
export const verifyIndianGovernmentIdentity = async (
  input: IndiaVerificationInput
): Promise<IndiaVerificationResult> => {
  const provider = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_PROVIDER as string | undefined)?.trim() || "mock";

  // Prefer secure backend proxy endpoint when available.
  try {
    const backendResponse = await axios.post(
      buildProxyUrl("/api/verify/identity"),
      {
        governmentId: input.governmentId.trim(),
        fullName: input.fullName.trim(),
        ngoName: input.ngoName?.trim() || "",
        ngoWebsite: input.ngoWebsite?.trim() || "",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return normalizePayloadResult(backendResponse.data ?? {}, provider);
  } catch (error: any) {
    if (!isBackendUnavailableError(error)) {
      return {
        status: "pending",
        provider,
        reason: error?.response?.data?.reason || error?.response?.data?.message || error?.message || "Verification API failed",
        isVerified: false,
      };
    }
  }

  if (provider === "mock") {
    const isLikelyValid = input.governmentId.trim().length >= 8;
    return {
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-kyc",
      providerReferenceId: `MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock verification passed" : "Mock verification requires review",
      isVerified: isLikelyValid,
      raw: {
        governmentIdLength: input.governmentId.trim().length,
      },
    };
  }

  if (provider === "open-public") {
    const normalizedGovernmentId = normalizeGovernmentId(input.governmentId.trim());
    const fullNameValid = input.fullName.trim().length >= 3;
    const isAadhaar = AADHAAR_PATTERN.test(normalizedGovernmentId);
    const isPan = PAN_PATTERN.test(normalizedGovernmentId);
    const aadhaarChecksumValid = isAadhaar ? isAadhaarChecksumValid(normalizedGovernmentId) : false;
    const formatValid = isPan || aadhaarChecksumValid;
    const isVerified = fullNameValid && formatValid;

    return {
      status: isVerified ? "verified" : "pending",
      provider: "open-public-checks",
      providerReferenceId: `OPEN-${Date.now()}`,
      reason: isVerified
        ? isAadhaar
          ? "No-partner checks passed (Aadhaar checksum + profile fields)."
          : "No-partner checks passed (PAN format + profile fields)."
        : "No-partner checks could not verify ID format/checksum yet.",
      isVerified,
      raw: {
        fullNameValid,
        isAadhaar,
        isPan,
        aadhaarChecksumValid,
        mode: "format-and-checksum",
      },
    };
  }

  const baseUrl = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_BASE_URL as string | undefined)?.trim();
  const apiKey = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_API_KEY as string | undefined)?.trim();

  if (!baseUrl || !apiKey) {
    return {
      status: "pending",
      provider,
      reason: "Verification provider is not configured.",
      isVerified: false,
    };
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/digilocker/verify`,
      {
        governmentId: input.governmentId.trim(),
        fullName: input.fullName.trim(),
        ngoName: input.ngoName?.trim() || "",
        ngoWebsite: input.ngoWebsite?.trim() || "",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const payload = response.data ?? {};
    const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);

    return {
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    };
  } catch (error: any) {
    return {
      status: "pending",
      provider,
      reason: error?.response?.data?.message || error?.message || "Verification API failed",
      isVerified: false,
    };
  }
};

// NOTE: Frontend API keys are visible in the browser. Move this call to a backend/Cloud Function for production.
export const verifyIndianNgoDocuments = async (
  input: IndiaNgoVerificationInput
): Promise<IndiaVerificationResult> => {
  const provider = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_PROVIDER as string | undefined)?.trim() || "mock";

  // Prefer secure backend proxy endpoint when available.
  try {
    const backendResponse = await axios.post(
      buildProxyUrl("/api/verify/ngo"),
      {
        ngoName: input.ngoName.trim(),
        ngoWebsite: input.ngoWebsite.trim(),
        documentImage: input.documentImage,
        contactName: input.contactName?.trim() || "",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return normalizePayloadResult(backendResponse.data ?? {}, provider);
  } catch (error: any) {
    if (!isBackendUnavailableError(error)) {
      return {
        status: "pending",
        provider,
        reason: error?.response?.data?.reason || error?.response?.data?.message || error?.message || "NGO verification API failed",
        isVerified: false,
      };
    }
  }

  if (provider === "mock") {
    const hasDocument = input.documentImage.startsWith("data:image/");
    const hasWebsite = input.ngoWebsite.trim().length > 0;
    const isLikelyValid = hasDocument && hasWebsite && input.ngoName.trim().length > 2;

    return {
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-ngo-kyc",
      providerReferenceId: `NGO-MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock NGO document verification passed" : "Mock NGO documents need manual review",
      isVerified: isLikelyValid,
      raw: {
        hasDocument,
        ngoNameLength: input.ngoName.trim().length,
      },
    };
  }

  const baseUrl = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_BASE_URL as string | undefined)?.trim();
  const apiKey = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_API_KEY as string | undefined)?.trim();

  if (!baseUrl || !apiKey) {
    return {
      status: "pending",
      provider,
      reason: "Verification provider is not configured.",
      isVerified: false,
    };
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/ngo/verify`,
      {
        ngoName: input.ngoName.trim(),
        ngoWebsite: input.ngoWebsite.trim(),
        documentImage: input.documentImage,
        contactName: input.contactName?.trim() || "",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const payload = response.data ?? {};
    const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);

    return {
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    };
  } catch (error: any) {
    return {
      status: "pending",
      provider,
      reason: error?.response?.data?.message || error?.message || "NGO verification API failed",
      isVerified: false,
    };
  }
};
