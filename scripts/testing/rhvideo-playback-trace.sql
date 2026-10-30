-- Offline analysis of an explicitly owned Android QA trace. This does not
-- contact a device/service or change playback. Slice totals can overlap;
-- they are elapsed intervals, not additive CPU time or proof of a root cause.
SELECT * FROM trace_bounds;

SELECT name, value, severity FROM stats
WHERE value > 0 AND (severity = 'error' OR name GLOB '*overrun*' OR name GLOB '*lost*');

SELECT p.pid, p.name AS process, t.tid, t.name AS thread,
       ROUND(SUM(s.dur) / 1e6, 2) AS cpu_ms, COUNT(*) AS switches
FROM sched_slice s JOIN thread t USING (utid) LEFT JOIN process p USING (upid)
WHERE s.dur > 0 GROUP BY s.utid ORDER BY cpu_ms DESC LIMIT 24;

SELECT p.pid, t.tid, t.name, st.state,
       ROUND(SUM(st.dur) / 1e6, 2) AS elapsed_ms, COUNT(*) AS samples
FROM thread_state st JOIN thread t USING (utid) JOIN process p USING (upid)
WHERE p.name = 'com.railgunhamster.rhfiles' AND st.dur > 0
  AND (t.tid = p.pid OR t.name = 'RenderThread' OR t.name GLOB 'ExoPlayer:*')
GROUP BY st.utid, st.state ORDER BY p.pid, t.tid, elapsed_ms DESC;

SELECT p.pid, t.tid, t.name AS thread, s.name, COUNT(*) AS samples,
       ROUND(SUM(s.dur) / 1e6, 2) AS elapsed_ms,
       ROUND(MAX(s.dur) / 1e6, 2) AS maximum_ms
FROM slice s JOIN thread_track tr ON s.track_id = tr.id
JOIN thread t ON tr.utid = t.utid JOIN process p USING (upid)
WHERE p.name = 'com.railgunhamster.rhfiles' AND s.dur > 0
GROUP BY s.track_id, s.name ORDER BY elapsed_ms DESC LIMIT 32;

-- Separate time spent running, runnable or asleep inside codec output calls.
-- A stack in releaseOutputBuffer alone cannot establish that it was blocked.
WITH releases AS (
  SELECT s.ts, s.dur, t.utid, t.tid, p.pid
  FROM slice s JOIN thread_track tr ON s.track_id = tr.id
  JOIN thread t ON tr.utid = t.utid JOIN process p USING (upid)
  WHERE p.name = 'com.railgunhamster.rhfiles' AND t.name GLOB 'ExoPlayer:*'
    AND s.name = 'releaseOutputBuffer' AND s.dur > 0
)
SELECT r.pid, r.tid, st.state,
       ROUND(SUM(MAX(0, MIN(st.ts + st.dur, r.ts + r.dur) - MAX(st.ts, r.ts))) / 1e6, 2) AS overlap_ms
FROM releases r JOIN thread_state st ON st.utid = r.utid
  AND st.dur > 0 AND st.ts < r.ts + r.dur AND st.ts + st.dur > r.ts
GROUP BY r.pid, r.tid, st.state ORDER BY r.pid, r.tid, overlap_ms DESC;
