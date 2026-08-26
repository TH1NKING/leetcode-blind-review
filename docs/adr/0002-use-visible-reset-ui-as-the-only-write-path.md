# Use the visible Reset UI as the only write path

Blind Review Mode will reset drafts only by driving the visible Reset interaction provided by `leetcode.cn`. It will not write browser storage or editor contents, call private APIs, or manipulate React or editor internals, even as a fallback. This deliberately trades resilience to UI redesigns for a narrow and auditable destructive path: if the known Reset interaction cannot be identified and confirmed, the attempt enters Guarded Failure instead of trying a less trustworthy mechanism.
