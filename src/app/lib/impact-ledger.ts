export type ImpactLedgerPayload = {
  donationId: string;
  foodName: string;
  quantity: number;
  donorUid?: string;
  receiverUid?: string;
  volunteerUid?: string;
  volunteerName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  proofDescription: string;
  proofImageCount: number;
  deliveredAtIso: string;
  estimatedCo2KgSaved: number;
  estimatedLandfillKgAvoided: number;
};

const normalizeQuantity = (rawQuantity: string): number => {
  const parsed = Number.parseInt(rawQuantity, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const sortedKeys = Object.keys(objectValue).sort();
    const normalized: Record<string, unknown> = {};
    sortedKeys.forEach((key) => {
      normalized[key] = canonicalize(objectValue[key]);
    });
    return normalized;
  }

  return value;
};

const toCanonicalString = (value: unknown): string => {
  return JSON.stringify(canonicalize(value));
};

const sha256Hex = async (input: string): Promise<string> => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // Lightweight fallback when SubtleCrypto is unavailable.
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const buildImpactLedgerPayload = (input: {
  donationId: string;
  foodName: string;
  quantityRaw: string;
  donorUid?: string;
  receiverUid?: string;
  volunteerUid?: string;
  volunteerName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  proofDescription: string;
  proofImageCount: number;
  deliveredAtIso: string;
}): ImpactLedgerPayload => {
  const quantity = normalizeQuantity(input.quantityRaw);

  return {
    donationId: input.donationId,
    foodName: input.foodName,
    quantity,
    donorUid: input.donorUid,
    receiverUid: input.receiverUid,
    volunteerUid: input.volunteerUid,
    volunteerName: input.volunteerName,
    pickupAddress: input.pickupAddress,
    deliveryAddress: input.deliveryAddress,
    proofDescription: input.proofDescription.trim(),
    proofImageCount: input.proofImageCount,
    deliveredAtIso: input.deliveredAtIso,
    estimatedCo2KgSaved: Number((quantity * 2.5).toFixed(2)),
    estimatedLandfillKgAvoided: Number((quantity * 0.8).toFixed(2)),
  };
};

export const createImpactLedgerHash = async (input: {
  payload: ImpactLedgerPayload;
  previousHash: string;
  sequence: number;
}): Promise<string> => {
  const hashInput = toCanonicalString({
    payload: input.payload,
    previousHash: input.previousHash,
    sequence: input.sequence,
  });

  return sha256Hex(hashInput);
};
