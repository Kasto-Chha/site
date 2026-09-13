// Stands in for @upstash/redis. lib/ratelimit.js only ever constructs it and
// hands it to Ratelimit, which here is also a stub — so this needs no storage
// of its own.

export class Redis {
  static fromEnv() {
    return new Redis();
  }
}
