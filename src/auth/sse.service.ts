import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseEvent {
  userId: string;
  sessionId?: string;
  type: 'session_revoked' | 'user_deactivated';
}

@Injectable()
export class SseService {
  private events$ = new Subject<SseEvent>();

  subscribe(userId: string, sessionId: string) {
    return this.events$.asObservable().pipe(
      filter(
        (event) =>
          (event.userId === userId && !event.sessionId) ||
          (event.userId === userId && event.sessionId === sessionId),
      ),
      map((event) => ({
        data: JSON.stringify({ type: event.type }),
      })),
    );
  }

  emitSessionRevoked(userId: string, sessionId: string) {
    this.events$.next({ userId, sessionId, type: 'session_revoked' });
  }

  emitAllSessionsRevoked(userId: string) {
    this.events$.next({ userId, type: 'session_revoked' });
  }

  emitUserDeactivated(userId: string) {
    this.events$.next({ userId, type: 'user_deactivated' });
  }
}
