import { v1 as uuidV1, v4 as uuidV4, validate as UUIDValidaton } from "uuid";

export const uuid = {
  toBinary: (uuid?: any): any => {
    if (!uuid) uuid = uuidV1();
    else if (typeof uuid !== "string" && Buffer.isBuffer(uuid)) return uuid;
    const buf = Buffer.from(uuid.replace(/-/g, ""), "hex");
    return Buffer.concat([
      buf.subarray(6, 8),
      buf.subarray(4, 6),
      buf.subarray(0, 4),
      buf.subarray(8, 16),
    ]);
  },
  toString: (binary: any): string => {
    if (!binary) throw new Error("Kindly supply binary UUID value");
    if (typeof binary === "string") return binary;
    return [
      binary.toString("hex", 4, 8),
      binary.toString("hex", 2, 4),
      binary.toString("hex", 0, 2),
      binary.toString("hex", 8, 10),
      binary.toString("hex", 10, 16),
    ].join("-");
  },
  get: (version?: "v1" | "v4"): string => {
    const uuid = {
      v1: uuidV1(),
      v4: uuidV4(),
    };

    return uuid[version || "v1"];
  },
  isValid: (uuid: string): boolean => UUIDValidaton(uuid),
  manyToString: (data: any, keys = []) => {
    if (!data) return;
    keys.forEach((key) => {
      if (data[key]) data[key] = uuid.toString(data[key]);
    });
    return data;
  },
  manyToBinary: (data: any, keys = []) => {
    if (!data) return;
    keys.forEach((key) => {
      if (data[key]) data[key] = uuid.toBinary(data[key]);
    });
    return data;
  },
};
