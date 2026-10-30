import { DatabaseSync } from "node:sqlite";

function isBusy(error: unknown): boolean {
  // SQLite extended result codes retain the primary result in the low byte.
  const code = (error as { errcode?: number } | null)?.errcode;
  return typeof code === "number" && [5, 6].includes(code & 255);
}

export class TrafficRecorder {
  private readonly db: DatabaseSync;
  private readonly pending = new Map<string, {
    direction: string; opcode: number; packets: number; bytes: number;
  }>();
  private retry?: ReturnType<typeof setTimeout>;

  constructor(path: string) {
    // Telemetry must never wait on a writer while the game is sending packets.
    // Account/progress writes use Store.db and its own busy timeout instead.
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=0");
  }

  record(direction: string, opcode: number, bytes: number): void {
    const key = `${direction}:${opcode}`;
    const value = this.pending.get(key) ?? { direction, opcode, packets: 0, bytes: 0 };
    value.packets++;
    value.bytes += bytes;
    this.pending.set(key, value);
    if (!this.retry) this.flush();
  }

  private flush(): void {
    try {
      const insert = this.db.prepare(
        `INSERT INTO traffic VALUES(?,?,?,?) ON CONFLICT(direction,opcode)
         DO UPDATE SET packets=packets+excluded.packets,bytes=bytes+excluded.bytes`,
      );
      for (const [key, value] of this.pending) {
        insert.run(value.direction, value.opcode, value.packets, value.bytes);
        this.pending.delete(key);
      }
    } catch (error) {
      if (!isBusy(error)) throw error;
      this.retry = setTimeout(() => {
        this.retry = undefined;
        try {
          this.flush();
        } catch (failure) {
          console.error("Falha ao registrar contadores de tráfego:", failure);
        }
      }, 250);
      this.retry.unref();
    }
  }

  close(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    try {
      // During shutdown no packets are waiting for this diagnostic write.
      this.db.exec("PRAGMA busy_timeout=5000");
      if (this.pending.size) this.flush();
      if (this.pending.size)
        console.warn("Banco ocupado ao encerrar: contadores de tráfego pendentes; capturas em arquivo preservadas.");
    } finally {
      if (this.retry) clearTimeout(this.retry);
      this.retry = undefined;
      this.db.close();
    }
  }
}
