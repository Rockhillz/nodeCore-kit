import { CopyObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3 } from "../src/adapters/s3";
import { NotFoundError, ServerError } from "../src/core/error";
import { noopLogger } from "../src/core/logger";

const fakeClient = (handler: (command: any) => any) =>
  ({ send: vi.fn(async (command: any) => handler(command)) }) as unknown as S3Client;

describe("S3", () => {
  it("builds encoded AWS object URLs", async () => {
    const s3 = new S3({ region: "eu-west-1", client: fakeClient(() => ({})) }, noopLogger);
    const res = await s3.upload({ bucket: "b", key: "users/John Doe/ñ.png", body: "x" });
    expect(res.url).toBe("https://b.s3.eu-west-1.amazonaws.com/users/John%20Doe/%C3%B1.png");
  });

  it("uses path-style URLs for custom endpoints", async () => {
    const s3 = new S3(
      { region: "us-east-1", endpoint: "http://localhost:4566/", client: fakeClient(() => ({})) },
      noopLogger,
    );
    const res = await s3.upload({ bucket: "b", key: "a b.txt", body: "x" });
    expect(res.url).toBe("http://localhost:4566/b/a%20b.txt");
  });

  it("uses publicUrl when set", async () => {
    const s3 = new S3(
      { region: "us-east-1", publicUrl: "https://cdn.example.com", client: fakeClient(() => ({})) },
      noopLogger,
    );
    const res = await s3.upload({ bucket: "b", key: "img/1.png", body: "x" });
    expect(res.url).toBe("https://cdn.example.com/img/1.png");
  });

  it("URL-encodes CopySource", async () => {
    let input: any;
    const client = fakeClient((c) => {
      if (c instanceof CopyObjectCommand) input = c.input;
      return {};
    });
    const s3 = new S3({ region: "us-east-1", defaultBucket: "b", client }, noopLogger);
    await s3.copy({ sourceKey: "my file.txt", destinationKey: "copy.txt" });
    expect(input.CopySource).toBe("b/my%20file.txt");
  });

  it("throws NotFoundError for a missing object", async () => {
    const client = fakeClient((c) => {
      if (c instanceof GetObjectCommand) {
        throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
      }
      return {};
    });
    const s3 = new S3({ region: "us-east-1", defaultBucket: "b", client }, noopLogger);
    await expect(s3.download({ key: "missing" })).rejects.toThrow(NotFoundError);
  });

  it("throws ServerError for other failures", async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    });
    const s3 = new S3({ region: "us-east-1", defaultBucket: "b", client }, noopLogger);
    await expect(s3.download({ key: "k" })).rejects.toThrow(ServerError);
  });
});
