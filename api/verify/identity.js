import axios from "axios";

const normalizeStatus = (value) => {
  if (value === "verified" || value === "approved" || value === "success") {
    return "verified";
  }
  if (value === "rejected" || value === "failed" || value === "error") {
    return "rejected";
  }
  return "pending";
};

const getProviderConfig = () => {
  const provider = (process.env.INDIA_VERIFICATION_PROVIDER || process.env.VITE_INDIA_VERIFICATION_PROVIDER || "mock").trim();
  const baseUrl = (process.env.INDIA_VERIFICATION_BASE_URL || process.env.VITE_INDIA_VERIFICATION_BASE_URL || "").trim();
  const apiKey = (process.env.INDIA_VERIFICATION_API_KEY || process.env.VITE_INDIA_VERIFICATION_API_KEY || "").trim();
  return { provider, baseUrl, apiKey };
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

const isAadhaarChecksumValid = (aadhaar) => {
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

const normalizeGovernmentId = (raw) => raw.replace(/\s+/g, "").toUpperCase();

const parseBody = (body) => {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const input = parseBody(req.body);
  const governmentId = typeof input.governmentId === "string" ? input.governmentId.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const ngoName = typeof input.ngoName === "string" ? input.ngoName.trim() : "";
  const ngoWebsite = typeof input.ngoWebsite === "string" ? input.ngoWebsite.trim() : "";

  if (!governmentId || !fullName) {
    res.status(400).json({
      status: "pending",
      provider: "validation",
      isVerified: false,
      reason: "governmentId and fullName are required.",
    });
    return;
  }

  const { provider, baseUrl, apiKey } = getProviderConfig();

  if (provider === "open-public") {
    const normalizedGovernmentId = normalizeGovernmentId(governmentId);
    const fullNameValid = fullName.length >= 3;
    const isAadhaar = AADHAAR_PATTERN.test(normalizedGovernmentId);
    const isPan = PAN_PATTERN.test(normalizedGovernmentId);
    const aadhaarChecksumValid = isAadhaar ? isAadhaarChecksumValid(normalizedGovernmentId) : false;
    const formatValid = isPan || aadhaarChecksumValid;
    const isVerified = fullNameValid && formatValid;

    res.status(200).json({
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
    });
    return;
  }

  if (provider === "mock") {
    const isLikelyValid = governmentId.length >= 8;
    res.status(200).json({
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-kyc",
      providerReferenceId: `MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock verification passed" : "Mock verification requires review",
      isVerified: isLikelyValid,
      raw: { governmentIdLength: governmentId.length },
    });
    return;
  }

  if (!baseUrl || !apiKey) {
    res.status(200).json({
      status: "pending",
      provider,
      isVerified: false,
      reason: "Verification provider is not configured.",
    });
    return;
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/digilocker/verify`,
      { governmentId, fullName, ngoName, ngoWebsite },
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

    res.status(200).json({
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    });
  } catch (error) {
    res.status(200).json({
      status: "pending",
      provider,
      isVerified: false,
      reason: error?.response?.data?.message || error?.message || "Verification API failed",
    });
  }
}
