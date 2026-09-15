import type { Task } from '../../api/client';

/**
 * Whether a Task has user-visible detached work.
 *
 * ``background_active`` is an internal PTY session-generation marker. A
 * Claude PTY can remain retained while it flushes/finishes without any child
 * agent, and that implementation detail should not turn the Task into a
 * "Background" row in the UI. The durable sub-agent count is the public
 * signal. Older/incomplete payloads without the count fall back to the
 * legacy marker so mixed-version clients remain usable.
 */
export function taskHasVisibleBackground(task: Pick<Task, 'background_active'> & {
  active_sub_agents?: number;
}): boolean {
  if (typeof task.active_sub_agents === 'number') {
    return task.active_sub_agents > 0;
  }
  return task.background_active === true;
}
