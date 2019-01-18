import { createHash } from 'crypto';
import { Http } from './http';
import { Observable } from 'rxjs';

const HASH_SALT = String(process.env.HASH_SALT);
const STORAGE_API = 'https://www.jsonstore.io';
const HASH = (s) => createHash('sha256').update(`${HASH_SALT}${s}`).digest('hex');

export class JsonStorage {
  private userHash: string;

  constructor(username: string) {
    this.userHash = HASH(username);
  }

  setItem(key: string, value: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify({ value });

    return Http.put(`${STORAGE_API}/${this.userHash}/objects/${HASH(key)}`, { headers, body });
  }

  getItem<T>(key: string): Observable<T> {
    return Http.get(`${STORAGE_API}/${this.userHash}/objects/${HASH(key)}`)
      .pipe((r: any) => r.result);
  }

  removeItem(key: string) {
    return Http.delete(`${STORAGE_API}/${this.userHash}/objects/${HASH(key)}`);
  }

  hasItem(key: string) {
    return Http.head(`${STORAGE_API}/${this.userHash}/objects/${HASH(key)}`);
  }
}
