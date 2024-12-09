export async function SettleAllPromise({
  ...jobs
}: { [k in string | number]: any } | any[]): Promise<{
  errors: Record<string, unknown>;
  results: Record<string, unknown>;
  stats: { total: number; status: string; error?: number; rate?: string };
}> {
  const errors: Record<string, unknown> = {};
  const results: Record<string, unknown> = {};
  await Promise.all(
    Object.keys(jobs).map(async function (key) {
      try {
        results[key] = await jobs[key as keyof typeof jobs];
      } catch (err) {
        errors[key] = err;
      }
    })
  );
  return {
    errors,
    results,
    get stats() {
      const resultJobs = Object.keys(results).length;
      const errJobs = Object.keys(errors).length;
      if (!errJobs) {
        return {
          total: resultJobs,
          status: "✅",
        };
      }
      return {
        total: errJobs + resultJobs,
        status: "❌",
        error: errJobs,
        get errRate() {
          return ((errJobs * 100) / (errJobs + resultJobs)).toFixed(2) + "%";
        },
      };
    },
  };
}

export async function delay(ms: number = 0) {
  await new Promise((r) => setTimeout(r, ms));
}
