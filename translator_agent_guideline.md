
# Translation and Localisation AI Agent (HTML Safe)

## Project Overview
This project builds an AI agent that translates landing pages and advertorials while preserving the original HTML structure.

The system receives full HTML as input and outputs translated HTML that is ready to publish.

Primary target language: German.

The agent must translate and lightly localize content so it reads like native copy written by a human in the target language.

The system must preserve meaning, structure, and compliance boundaries.

---

## Project Goal
Build an AI agent that:

- Accepts full HTML landing pages as input
- Translates visible content into another language
- Preserves HTML structure and layout
- Performs limited localization
- Outputs publish ready HTML

The final translation must read as if it was originally written by a native speaker.

---

## Core Principle
This agent is not a creative editor and not a content rewriter.

It must always:

- Preserve meaning
- Preserve intent
- Preserve page structure
- Preserve compliance boundaries

The output must feel native but must not alter the original message.

---

## Input Requirements
The agent always receives:

- Full HTML code of a landing page or advertorial
- Target language (example: German)

The HTML may contain:

- Text nodes
- Placeholders
- Testimonials
- Personal names
- Locations
- Institutional references
- Legal or disclaimer text

The agent must process the HTML directly.

The system must not extract text into external formats before processing.

---

## HTML Safety Rules
The agent must never change the following:

- HTML structure
- CSS styles
- Class names
- Element IDs
- Page layout
- Section order
- Links or URLs
- Claims or promises

The agent must not:

- Add elements
- Remove elements
- Reorder elements
- Modify CSS
- Modify JavaScript
- Modify links

Only human visible text may be translated or localized.

---

## Translation Requirements

### Translation Quality
The translation must be:

- Natural
- Fluent
- Idiomatic
- Grammatically correct
- Appropriate for advertorial or marketing tone

German specific rules:

- Sentence structure must sound native
- No literal English phrasing
- Consistent tone across the page
- Correct punctuation
- Correct capitalization

The final text must read like a German copywriter originally wrote it.

---

## Proofreading and Refinement
After translation the agent must automatically:

- Proofread the translated content
- Fix awkward phrasing
- Remove literal translation artifacts
- Ensure tone consistency across the page

This step is mandatory.

---

## Localization Rules
The system performs light and controlled localization.

Localization must preserve meaning and intent.

Allowed localization examples include the following.

### Names
American testimonial names may be replaced with German names.

Example  
John M., Ohio → Thomas K., München

### Locations
US cities or states may be replaced with appropriate German cities.

Example  
Ohio → München

### Country References
USA references may be replaced with Deutschland when context allows.

### Institutional References
Examples

American research department → German research institute  
US doctors → German doctors

### Cultural Context
The system may adjust:

- Units
- Cultural phrasing
- Tone expectations

---

## Localization Restrictions
Localization must never:

- Invent authorities
- Invent institutions
- Increase credibility claims
- Add certifications
- Add endorsements
- Change the underlying message
- Remove disclaimers
- Alter legal meaning

Localization only aligns context.

It must never enhance or exaggerate claims.

---

## Handling Special Content

### Testimonials
For testimonials the agent must:

- Translate testimonial text naturally
- Localize names and locations
- Preserve emotional tone
- Maintain original claims

The system must not exaggerate or soften statements.

### Legal or Disclaimer Text
For legal or disclaimer sections the system must:

- Translate accurately
- Preserve legal meaning
- Use correct legal phrasing in the target language

Creative rewriting is not allowed.

---

## Output Requirements
The agent must output:

- Full HTML document
- Identical structure
- Translated visible text
- Localized names and locations where applicable

The output must contain:

- No untranslated placeholders
- No broken formatting
- No structural modifications

The final HTML must be ready for immediate deployment.

Optional output:

- Short report listing localization changes such as names and locations

---

## Definition of Success
The system is successful when:

- The translated page reads like native content
- HTML and CSS remain unchanged
- Meaning and intent are preserved
- Testimonials feel locally believable
- The page can be published without manual fixes

---

## One Sentence Summary
Build an AI agent that takes full HTML input and safely translates and lightly localizes it so the result reads like native content in the target language while preserving structure, meaning, and compliance boundaries.
