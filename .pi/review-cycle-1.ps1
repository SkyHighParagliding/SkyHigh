CYCLE 1 — Review Agent Workflow
================================
Execute each step in sequence. Wait for each to finish before starting the next.

For each step, run:
  cd C:\Users\User\Documents\CodeFolder\skyhigh
  (cat .pi\skills\<skill-name>\SKILL.md & echo. & echo User: Perform your review now. Write to .pi/reviews/cycle-1-<name>) | pi --print

Steps:
1. review-bugs            -> .pi/reviews/cycle-1-bugs
2. review-duplication      -> .pi/reviews/cycle-1-duplication
3. review-security         -> .pi/reviews/cycle-1-security
4. review-performance      -> .pi/reviews/cycle-1-performance
5. review-database          -> .pi/reviews/cycle-1-database
6. review-coordinator       -> .pi/reviews/cycle-1-plan
7. review-fixer             -> .pi/reviews/cycle-1-fix-report
