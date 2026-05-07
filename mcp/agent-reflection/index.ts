import { createMCPServer } from '../../packages/core/mcp/builder'

interface ReflectionLog {
  timestamp: number
  context: string
  observation: string
  improvement: string
  category: string
  implemented: boolean
}

export default createMCPServer({
  name: 'reflection',
  version: '1.0.0',
  description: 'Self-Improvement Reflection System - Metacognition for AI agents',
  author: 'MCP Expert Community',
  icon: '🧠'
})
  .addTool({
    name: 'after_action_review',
    description: 'Conduct after action review - what went well, what went wrong, lessons learned',
    parameters: {
      taskDescription: { type: 'string', description: 'Original task', required: true },
      executionProcess: { type: 'string', description: 'How it was executed', required: true },
      finalOutcome: { type: 'string', description: 'Final result', required: true },
      duration: { type: 'string', description: 'Time spent', required: false }
    },
    execute: async (params: Record<string, any>) => {
      return {
        success: true,
        reviewComplete: true,
        reviewFramework: `
## 📝 AFTER ACTION REVIEW

**Task:** ${params.taskDescription}
**Duration:** ${params.duration || 'Not specified'}

---

### ✅ WHAT WENT WELL

For each success:
1. Identify the specific action
2. Why did it work?
3. How to replicate this in future?

---

### ⚠️ WHAT WENT WRONG / WHAT COULD IMPROVE

For each issue:
1. What specifically went wrong?
2. Root cause?
3. Concrete prevention strategy?

---

### 🎯 KEY LESSONS

> 3-5 specific, actionable lessons learned

---

### 🔄 NEXT TIME PLAYBOOK

**Before starting:**
- [ ] Check for similar lessons learned

**During execution:**
- [ ] Apply proven success patterns
- [ ] Watch for failure patterns

**Before finishing:**
- [ ] Quality checklist review

---

### 💡 PROCESS IMPROVEMENTS

Based on:
**Process:** ${params.executionProcess}
**Outcome:** ${params.finalOutcome}

Generate 3 actionable improvements to the process itself.
        `.trim()
      }
    }
  })
  .addTool({
    name: 'identify_bias',
    description: 'Check output for cognitive biases and blind spots',
    parameters: {
      outputToCheck: { type: 'string', description: 'Output generated', required: true },
      context: { type: 'string', description: 'Generation context', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const biases = [
        {
          name: 'Confirmation Bias',
          description: 'Seeking only evidence that confirms existing beliefs',
          check: 'Does this only show one side? Are counterarguments present? Is contradictory evidence addressed?'
        },
        {
          name: 'Availability Heuristic',
          description: 'Overweighting easily recalled examples',
          check: 'Are edge cases considered? Is this statistically representative? Are unusual scenarios covered?'
        },
        {
          name: 'Anchoring Bias',
          description: 'Over-reliance on first piece of information',
          check: 'Are multiple starting points considered? Could initial numbers be wrong?'
        },
        {
          name: 'Overconfidence Effect',
          description: 'Overestimating own abilities/knowledge',
          check: 'Are confidence levels stated? Are limitations acknowledged? Is humility visible?'
        },
        {
          name: 'Halo Effect',
          description: 'One positive trait colors overall judgment',
          check: 'Is criticism present? Are trade-offs discussed? Are weaknesses acknowledged?'
        },
        {
          name: 'Blind Spot Bias',
          description: 'Not seeing biases in self',
          check: 'Is self-criticism present? Is "I might be wrong" visible?'
        }
      ]
      return {
        success: true,
        biasCheckComplete: true,
        biasesEvaluated: biases.length,
        evaluationFramework: `
## 🔍 COGNITIVE BIAS AUDIT

**Context:** ${params.context}

---

### BIAS EVALUATION FRAMEWORK

Evaluate output against 6 core cognitive biases:

${biases.map((b, i) => `
**${i + 1}. ${b.name}**
*${b.description}*
▶️ ${b.check}
`).join('')}

---

### OUTPUT TO AUDIT:

${params.outputToCheck.slice(0, 1500)}

---

### AUDIT SCORECARD

For each bias:
- Score 0-10 (10 = bias HIGHLY present)
- Specific evidence
- Recommended correction

---

### 🧠 METACOGNITION CHECK

"How do I know I'm not biased when checking for bias?"

⚠️ Remember: Everyone has blind spots. The question is mitigation, not elimination.
        `.trim()
      }
    }
  })
  .addTool({
    name: 'quality_gate',
    description: 'Apply strict quality gate before finalizing output',
    parameters: {
      draftOutput: { type: 'string', description: 'Draft to evaluate', required: true },
      requirements: { type: 'string', description: 'Original requirements', required: true },
      audience: { type: 'string', description: 'Target audience', required: true }
    },
    execute: async (params: Record<string, any>) => {
      return {
        success: true,
        qualityGateReady: true,
        qualityChecklist: `
## 🚧 QUALITY GATE EVALUATION

**Requirements:** ${params.requirements}
**Audience:** ${params.audience}

---

### ✅ COMPLETENESS CHECKLIST

1. ❏ ALL requirements explicitly addressed?
2. ❏ No obvious gaps or TODOs?
3. ❏ Edge cases considered?
4. ❏ Error cases handled?
5. ❏ Instructions actionable?

---

### 🧠 CLARITY CHECKLIST

6. ❏ Language is unambiguous?
7. ❏ Structure logical and scannable?
8. ❏ Technical depth appropriate for audience?
9. ❏ Assumptions explicitly stated?
10. ❏ Jargon explained?

---

### ⚡ ACCURACY CHECKLIST

11. ❏ Factual claims can be verified?
12. ❏ No self-contradictions?
13. ❏ Numbers add up / make sense?
14. ❏ No outdated advice?
15. ❏ Citations available for key claims?

---

### 🏆 EXCELLENCE CHECKLIST

16. ❏ Would YOU want to receive this?
17. ❏ Is this 10x better than average?
18. ❏ Does it DELIGHT the user?
19. ❏ Does it anticipate unstated needs?
20. ❏ Is it memorable? Unique? Special?

---

### DRAFT TO EVALUATE:

${params.draftOutput.slice(0, 2000)}

---

### 🎯 FINAL VERDICT

For each checklist item failed:
- Specific location
- Exact improvement needed
- Concrete fix recommendation

✅ PASS: Ship it
⚠️ MINOR FIX: Address and ship
❌ FAIL: Go back - significant issues
        `.trim()
      }
    }
  })
  .addTool({
    name: 'process_retrospective',
    description: 'Generate meta-improvement: How to improve improvement itself',
    parameters: {
      recentReflections: { type: 'string', description: 'JSON array of reflection logs', required: true }
    },
    execute: async (params: Record<string, any>) => {
      let logs: ReflectionLog[] = []
      try {
        logs = JSON.parse(params.recentReflections)
      } catch (e) {}
      return {
        success: true,
        retrospective: true,
        patternAnalysis: `
## 🔄 META-REFLECTION

Analyzing ${logs.length} recent reflections for patterns.

---

### PATTERN ANALYSIS

**Frequency Analysis:**
- Which problem categories repeat most?
- Which improvements are never implemented?
- Are root causes getting deeper?

**Meta Questions:**
1. Are our reflections concrete enough? (actionable > vague)
2. Are we actually implementing improvements?
3. Are we measuring improvement impact?
4. Are we addressing root causes or symptoms?
5. Are our reflection questions the RIGHT questions?

---

### 💡 CONTINUOUS IMPROVEMENT LOOP

Goodhart's Law: "When a measure becomes a target, it ceases to be a good measure"

⚠️ Don't just optimize for the checklist - optimize for actual quality.
        `.trim()
      }
    }
  })
  .build()
