# Remain content-blind and local-only

Blind Review Mode will never read, copy, hash, log, or transmit editor code or adjacent problem-solving content, and it will make no telemetry requests. Persistent storage is limited to the enabled state and non-sensitive configuration; problem, language, tab, attempt, and ownership metadata are session-only. This sacrifices content-level reset verification and richer diagnostics in exchange for a narrow trust boundary, so future verification improvements must not silently introduce code access.
