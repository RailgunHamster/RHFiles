export function validateReport(report, {allowSkipped=false, minimum=1}={}) {
  if (!report || report.error || report.partial) throw Error('Missing, partial, or errored test report');
  if (!Array.isArray(report.results) || report.results.length < minimum) throw Error('No complete test cases');
  const counts={PASS:0,FAIL:0,SKIP:0},names=new Set();
  for (const row of report.results) {
    if (!row.name || names.has(row.name)) throw Error('Missing or duplicate test name');
    names.add(row.name);
    if (!Object.hasOwn(counts,row.status)) throw Error('Unknown test status: '+row.status);
    counts[row.status]++;
  }
  if (report.total!==report.results.length || report.passed!==counts.PASS || report.failed!==counts.FAIL ||
      (report.skipped ?? 0)!==counts.SKIP) throw Error('Report counts disagree with individual outcomes');
  if (counts.FAIL || (!allowSkipped && counts.SKIP)) throw Error(`${counts.FAIL} failed, ${counts.SKIP} skipped`);
  return counts;
}
