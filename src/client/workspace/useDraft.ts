import { useEffect, useRef, useState } from "react";

/** A serialized save queue, with a local recovery copy until the server acknowledges it. */
export function useDraft<T>(
  key: string,
  initial: T,
  save: (value: T) => Promise<unknown>,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const draft = localStorage.getItem(key);
      return draft ? JSON.parse(draft).value : initial;
    } catch {
      return initial;
    }
  });
  const [status, setStatus] = useState<
    "saved" | "pending" | "saving" | "error"
  >(() => {
    try {
      return localStorage.getItem(key) ? "pending" : "saved";
    } catch {
      return "saved";
    }
  });
  const [recovered] = useState(() => {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  });
  const latest = useRef(value);
  const revision = useRef(recovered ? 1 : 0);
  const savedRevision = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const queue = useRef(Promise.resolve());
  const saveRef = useRef(save);
  saveRef.current = save;
  const flush = () => {
    clearTimeout(timer.current);
    const next = latest.current;
    const version = revision.current;
    if (version === savedRevision.current) return queue.current;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (version <= savedRevision.current) return;
        if (mounted.current) setStatus("saving");
        try {
          await saveRef.current(next);
          savedRevision.current = version;
          if (version === revision.current) {
            try {
              localStorage.removeItem(key);
            } catch {}
            if (mounted.current) setStatus("saved");
          }
        } catch (error) {
          if (mounted.current) setStatus("error");
          throw error;
        }
      });
    // The returned promise remains rejectable for explicit Save; background callers handle it.
    return queue.current;
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    mounted.current = true;
    if (recovered)
      timer.current = setTimeout(
        () => void flushRef.current().catch(() => {}),
        800,
      );
    const leave = (event: BeforeUnloadEvent) => {
      if (revision.current !== savedRevision.current) {
        void flushRef.current().catch(() => {});
        event.preventDefault();
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden")
        void flushRef.current().catch(() => {});
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      void flushRef.current().catch(() => {});
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [key]);
  function update(next: T) {
    latest.current = next;
    revision.current++;
    setValue(next);
    setStatus("pending");
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ value: next, updatedAt: new Date().toISOString() }),
      );
    } catch {
      /* Saving still works if browser storage is unavailable. */
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void flushRef.current().catch(() => {}),
      650,
    );
  }
  return { value, update, status, recovered, flush };
}
