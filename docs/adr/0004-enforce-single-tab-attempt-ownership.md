# Enforce single-tab attempt ownership per problem and language

Only one tab may own a Blind Attempt for a given Problem Identity and programming language. LeetCode keeps editor drafts in browser-local state that may be shared across same-origin tabs, so concurrent editing and Reset operations cannot be treated as independent. A second tab remains guarded until the user explicitly transfers ownership; the previous owner must be paused without clearing its in-memory code before the new owner may reset. This trades unrestricted multi-tab use for protection against cross-tab destructive races.
