import {expect,it} from 'vitest';
import {savedFailureMessage} from '@/components/conversations/research-transport';
import {PUBLIC_ERRORS} from '@/server/contracts/error-messages';
it.each(['DEADLINE_EXCEEDED','INPUT_BLOCKED','OUTPUT_BLOCKED','SAFETY_UNAVAILABLE','PROVIDER_UNAVAILABLE','BUDGET_EXCEEDED'] as const)('preserves the fixed terminal %s explanation',code=>{
 expect(savedFailureMessage(PUBLIC_ERRORS[code][1])).toBe(PUBLIC_ERRORS[code][1]);
});
it('replaces stale active-state warnings and unknown text with the saved failure fallback',()=>{
 expect(savedFailureMessage(PUBLIC_ERRORS.RUN_IN_PROGRESS[1])).toBe(PUBLIC_ERRORS.PROVIDER_UNAVAILABLE[1]);
 expect(savedFailureMessage('PRIVATE upstream text')).toBe(PUBLIC_ERRORS.PROVIDER_UNAVAILABLE[1]);
});
it('authoritative cancellation and expiry override an earlier error',()=>{
 expect(savedFailureMessage(PUBLIC_ERRORS.DEADLINE_EXCEEDED[1],'CANCELLED')).toBe('Research stopped. You can start a new search.');
 expect(savedFailureMessage(PUBLIC_ERRORS.RUN_IN_PROGRESS[1],'TIMED_OUT')).toBe('This research request timed out. You can start a new search.');
});
