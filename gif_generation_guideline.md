# GIF Mechanism Animation Guidelines

This document defines the **strict rules, logic, and validation process** an AI agent must follow when generating **mechanism explanation GIFs** for advertorial content.

The purpose of these GIFs is to visually communicate the **exact mechanism described in the specific section where the GIF appears**.

These guidelines must be followed **precisely** to ensure the generated animations are **accurate, section-specific, and aligned with the written copy**.

---

# Table of Contents

1. [Core Goal](#core-goal)
2. [Core Rules](#core-rules)
   - [Rule 1 — Derive GIF from Section Meaning](#rule-1--derive-gif-from-section-meaning)
   - [Rule 2 — High Accuracy With Text](#rule-2--high-accuracy-with-text)
   - [Rule 3 — Balanced Framing](#rule-3--balanced-framing)
   - [Rule 4 — Use Placeholder Section as Source of Truth](#rule-4--use-placeholder-section-as-source-of-truth)
   - [Rule 5 — One GIF Equals One Idea](#rule-5--one-gif-equals-one-idea)
3. [GIF Generation Workflow](#gif-generation-workflow)
4. [Accuracy Rules](#accuracy-rules)
5. [Final Validation Checklist](#final-validation-checklist)
6. [Summary Principle](#summary-principle)

---

# Core Goal

A mechanism GIF must **visually explain the exact idea of the text section where it appears**.

The animation should function as:

> **A visual version of the paragraph beside it.**

The GIF must **NOT**:

- represent a general concept
- represent the entire product
- represent the disease in general
- represent the page’s overall theme
- represent loosely related ideas

Instead, it must represent **only the mechanism described in the specific section**.

---

# Core Rules

## Rule 1 — Derive GIF from Section Meaning

Before generating a GIF, the agent must determine:

**What exact mechanism or idea is this section explaining?**

The GIF must be generated **only from that mechanism**.

The agent must **NOT derive the animation from**:

- the overall advertorial narrative
- the product concept as a whole
- general knowledge about the disease
- unrelated ideas from other sections

### Example Scenarios

**Example A**

If a section explains:

> Oral supplements are destroyed before reaching the lungs.

The GIF should show:


Ingestion → digestion → breakdown before lungs


---

**Example B**

If a section explains:

> Direct delivery reaches the airways.

The GIF should show:


Direct pathway → lungs → airway delivery


---

**Example C**

If a section explains:

> Mucus blocks airflow.

The GIF should show:


Mucus buildup → airway narrowing → restricted airflow


Each GIF should represent **one precise visual mechanism**.

---

## Rule 2 — High Accuracy With Text

This is the **most important rule**.

The animation must match the written explanation **with extremely high accuracy**.

The GIF must:

- represent the same mechanism described in the text
- show the same cause → effect relationship
- communicate the same outcome

The GIF must **NOT**:

- add extra concepts
- introduce additional biological steps
- invent anatomy or pathways
- modify the mechanism
- simplify the explanation to the point that meaning changes

The animation must never **hallucinate**:

- anatomy
- biological pathways
- medical outcomes

If a reader compares the paragraph and the GIF, the reaction should be:

> “This is exactly what I just read.”

---

## Rule 3 — Balanced Framing

Mechanism GIFs must use **balanced visual framing**.

The animation must be:

- **not too zoomed in**
- **not too zoomed out**

The viewer must see:

- enough context to understand the mechanism
- enough detail to clearly observe the process

### Incorrect Framing Examples

Do NOT:

- show only a tiny airway tube
- show the entire human body if the lungs become too small to understand

### Correct Framing Example

Show:

- the relevant body region clearly
- enough surrounding context for understanding
- the mechanism at a readable visual scale

---

## Rule 4 — Use Placeholder Section as Source of Truth

The **text around the GIF placeholder** is the **primary source of truth**.

The agent must generate the GIF based on the **local section**, not the full page.

Before generating the GIF, the agent must answer the following questions.

### Required Questions

1. What is this section explaining?
2. What visual would make this explanation instantly clear?
3. What exact mechanism is described?
4. What should the viewer understand after seeing the GIF?

The GIF must be generated **from these answers**.

---

## Rule 5 — One GIF Equals One Idea

Each GIF must explain **one mechanism only**.

A single animation must not combine multiple unrelated processes.

### Disallowed Combinations

Do NOT combine:

- mucus blockage + digestion
- digestion + lung repair
- blockage + delivery + recovery
- multiple unrelated biological processes

### Allowed Scenario

Multiple stages are allowed **only when the section explicitly explains that sequence**.

Otherwise:


One Section → One Mechanism → One GIF


---

# GIF Generation Workflow

The agent must follow this **four-step workflow** before generating any mechanism GIF.

---

## Step 1 — Extract the Visual Idea

Identify the **single mechanism or concept** the section explains.

Example:


Mucus blocks airflow in the airway


---

## Step 2 — Convert the Mechanism Into an Animation

Translate the mechanism into a **cause → effect sequence**.

Example structure:


Cause → Process → Result


Example:


Mucus buildup → airway narrowing → restricted airflow


---

## Step 3 — Verify Alignment With Text

Confirm the animation:

- matches the mechanism in the section
- reflects the same cause and effect
- contains no additional concepts

If it does not match perfectly, it must be corrected.

---

## Step 4 — Generate the GIF

Only after the previous steps are validated should the GIF be generated.

---

# Accuracy Rules

The generated GIF must **never**:

- invent medical details
- contradict the written copy
- introduce unrelated mechanisms
- use generic medical animations
- overcomplicate the process
- display mechanisms not described in the section

The GIF must always feel:

- **section-specific**
- **precise**
- **visually obvious**
- **easy to connect to the text**

---

# Final Validation Checklist

Before approving a GIF, the agent must validate the following.

### Validation Questions

1. Does the GIF explain the **exact idea of the section**?
2. Does the animation **match the text closely**?
3. Is the **framing balanced**?
4. Would a reader **immediately connect the GIF to the paragraph**?

If any answer is **No**, the GIF must be **regenerated**.

---

# Summary Principle

A correct mechanism GIF functions as:

> **A visual explanation of a single paragraph’s mechanism.**

The GIF must always be:

- precise  
- section-specific  
- mechanism-focused  
- visually clear  
- tightly aligned with the written copy