# Semantic CMS Concepts Bundle

Version: 0.1.0
Status: Concept bundle / project-facing explanatory package

This package consolidates the conceptual model developed around the Semantic CMS, with emphasis on how the system is understood and used rather than on protocol internals.

## Core idea

A Semantic CMS manages canonical meaning rather than pages. It keeps one governed source of truth, resolves what matters for a given context, allows that meaning to take different forms, and ensures consequential change occurs through explicit governed interaction.

The simplest model is:

```text
WHAT EXISTS
   Canon
     ↓
WHAT MATTERS HERE
   Surface
     ↓
HOW IT APPEARS
   Expression
     ↓
WHAT IS ENCOUNTERED
   Representation
     ↓
WHAT MAY CHANGE
   Interaction
     ↓
   Canon
```

A shorter product-level phrase is:

> Truth → Relevance → Expression → Action

## Documents

- `docs/01-SEMANTIC-CMS.md` — what a Semantic CMS is and how it is used.
- `docs/02-MENTAL-MODEL.md` — the progressive explanation model for users, designers, developers, and stakeholders.
- `docs/03-IN-USE.md` — what working in the system can feel like.
- `docs/04-UNIQUENESS.md` — what is distinctive about the architecture.
- `docs/05-UI-VISUAL-LANGUAGE.md` — a visual grammar for making the concepts legible in-product.
- `docs/06-INTERACTION-PRINCIPLES.md` — governing product interaction principles.
- `docs/07-CANON-SURFACE-EXPRESSION-INTERACTION.md` — the core decomposition and boundaries.
- `docs/08-GLOSSARY.md` — plain-language and formal vocabulary side by side.

This package is explanatory. It does not supersede the canonical Semantic CMS design or any pinned formal resource.
