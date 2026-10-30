import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  openSync,
  writeSync,
  closeSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";

const sensitive =
  /^(password|passwd|pwd|key|ticket|token|p|authorization|cookie)$/i;
export class HttpArchive {
  readonly directory: string;
  constructor(dataDir: string) {
    this.directory = join(dataDir, "http");
  }
  begin(
    method: string,
    url: URL,
    contentType: string,
    body: Buffer,
    status: number,
    responseType: string,
  ): HttpTransfer | undefined {
    if (
      /^\/(?:launcher\/api\/|login(?:2)?$|loginselectlist$|visualizeregister)/i.test(
        url.pathname,
      )
    )
      return;
    const cleaned = new URL(url);
    for (const name of [...cleaned.searchParams.keys()])
      if (sensitive.test(name)) cleaned.searchParams.set(name, "[redacted]");
    let request = body;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(body.toString());
      for (const name of [...form.keys()])
        if (sensitive.test(name)) form.set(name, "[redacted]");
      request = Buffer.from(form.toString());
    }
    if (contentType.includes("json")) {
      try {
        request = Buffer.from(
          JSON.stringify(JSON.parse(body.toString()), (key, value) =>
            sensitive.test(key) ? "[redacted]" : value,
          ),
        );
      } catch {
        /* preserve non-JSON bytes */
      }
    }
    const metadata = {
      id: randomUUID(),
      at: new Date().toISOString(),
      method,
      path: cleaned.pathname + cleaned.search,
      status,
      request: { contentType, ...this.object(request) },
      responseType,
    };
    return new HttpTransfer(this, metadata);
  }
  object(body: Buffer) {
    const sha256 = createHash("sha256").update(body).digest("hex");
    const folder = join(this.directory, "objects");
    mkdirSync(folder, { recursive: true });
    const file = join(folder, sha256 + ".bin");
    if (!existsSync(file)) writeFileSync(file, body);
    return { bytes: body.length, sha256, file: "objects/" + sha256 + ".bin" };
  }
  record(metadata: object) {
    mkdirSync(this.directory, { recursive: true });
    appendFileSync(
      join(
        this.directory,
        "http-" + new Date().toISOString().slice(0, 10) + ".jsonl",
      ),
      JSON.stringify(metadata) + "\n",
    );
  }
}
export class HttpTransfer {
  constructor(
    private archive: HttpArchive,
    private metadata: object,
  ) {}
  save(body: Buffer) {
    this.archive.record({
      ...this.metadata,
      complete: true,
      response: this.archive.object(body),
    });
  }
  stream(source: Readable): Readable {
    const temporary = join(this.archive.directory, randomUUID() + ".part");
    const fd = openSync(temporary, "wx"),
      hash = createHash("sha256");
    let bytes = 0,
      closed = false,
      complete = false;
    const close = () => {
      if (!closed) {
        closeSync(fd);
        closed = true;
      }
    };
    const archive = this.archive,
      metadata = this.metadata;
    const sink = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          let offset = 0;
          while (offset < chunk.length)
            offset += writeSync(fd, chunk, offset, chunk.length - offset);
          hash.update(chunk);
          bytes += chunk.length;
          callback(null, chunk);
        } catch (error) {
          callback(error as Error);
        }
      },
      flush(callback) {
        try {
          close();
          const sha256 = hash.digest("hex");
          const file = join(archive.directory, "objects", sha256 + ".bin");
          if (existsSync(file)) unlinkSync(temporary);
          else renameSync(temporary, file);
          archive.record({
            ...metadata,
            complete: true,
            response: { bytes, sha256, file: "objects/" + sha256 + ".bin" },
          });
          complete = true;
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      destroy(error, callback) {
        close();
        if (!complete) {
          try {
            unlinkSync(temporary);
          } catch {}
          archive.record({
            ...metadata,
            complete: false,
            receivedBytes: bytes,
            error: error?.message ?? "stream-interrupted",
          });
        }
        source.destroy();
        callback(error);
      },
    });
    source.once("error", (error) => sink.destroy(error));
    source.once("close", () => {
      if (!source.readableEnded && !sink.destroyed)
        sink.destroy(new Error("upstream-interrupted"));
    });
    source.pipe(sink);
    return sink;
  }
}
