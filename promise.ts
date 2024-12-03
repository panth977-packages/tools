export async function SettleAllPromise({
  ...jobs
}: { [k in string | number]: any } | any[]) {
  const errors: Record<string, unknown> = {};
  await Promise.all(
    Object.keys(jobs).map(async function (key) {
      try {
        await jobs[key as keyof typeof jobs];
      } catch (err) {
        errors[key] = err;
      }
    })
  );
  const totalJobs = Object.keys(jobs).length;
  const errJobs = Object.keys(errors).length;
  return {
    totalJobs,
    errJobs,
    errors,
    getStats() {
      if (errJobs) {
        return {
          total: totalJobs,
          status: "❌",
          error: errJobs,
          rate: ((errJobs * 100) / totalJobs).toFixed(2) + "%",
        };
      } else {
        return {
          total: totalJobs,
          status: "✅",
        };
      }
    },
  };
}

export async function delay(ms: number = 0) {
  await new Promise((r) => setTimeout(r, ms));
}
