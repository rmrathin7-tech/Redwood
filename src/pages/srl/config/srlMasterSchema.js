// src/pages/srl/config/srlMasterSchema.js

export const srlMasterSchema = {
  stages: {
    idea: {
      id: 'idea',
      label: 'Idea Stage',
      modules: [
        {
          id: 'prob-idea',
          topic: 'Clarity of Problem statement',
          weight: 20,
          questions: [
            {
              id: 'q-prob-idea-1',
              text: 'What is the problem statement being addressed? How was this problem identified, and what is its background?',
              maxScore: 2,
              scoringBasis: 'Is the problem statement clearly defined with facts/numbers backing it up?',
              type: 'standard'
            },
            {
              id: 'q-prob-idea-2',
              text: 'What market study or research has been conducted to assess the problem–solution fit for the proposed idea?',
              maxScore: 2,
              scoringBasis: 'Evidence of primary or secondary market research.',
              type: 'standard'
            },
            {
              id: 'q-prob-idea-3',
              text: 'How are customers impacted by this problem?',
              maxScore: 3,
              scoringBasis: 'The impact should be a measurable metric. Has it been defined?',
              type: 'standard'
            },
            {
              id: 'q-prob-idea-4',
              text: 'Are there any existing solutions? What are they? What are the challenges?',
              maxScore: 1,
              scoringBasis: 'Identification of existing solutions, understanding of limitations, and clarity in explaining gaps.',
              type: 'standard'
            }
          ]
        },
        {
          id: 'sol-idea',
          topic: 'Strength and Differentiation of the solution',
          weight: 20,
          questions: [
            {
              id: 'q-sol-idea-1',
              text: 'What is the solution to the identified problem?',
              maxScore: 3,
              scoringBasis: 'Is the solution aligned with the problem statement?',
              type: 'standard'
            },
            {
              id: 'q-sol-idea-2',
              text: 'How does the solution address the problem effectively?',
              maxScore: 1,
              scoringBasis: 'The impact metric should undergo a change, proving that the solution is actually solving the problem.',
              type: 'standard'
            },
            {
              id: 'q-sol-idea-3',
              text: 'Current Status (Idea/Prototype/MVP). What methods were used to validate?',
              maxScore: 3,
              scoringBasis: 'Product validation should have followed usage, feedback, and implementation. More validations = better score.',
              type: 'standard'
            }
          ]
        },
        {
          id: 'team-idea',
          topic: 'Team Capabilities',
          weight: 16,
          questions: [
            {
              id: 'q-team-idea-1',
              text: 'What is the background of the founders, including educational and professional qualifications? What relevant industry experience does the team have?',
              maxScore: 3,
              scoringBasis: 'Relevant industry experience, proven track record.',
              type: 'standard'
            },
            {
              id: 'q-team-idea-2',
              text: 'Are the founders working on the startup on a full-time or part-time basis?',
              maxScore: 3,
              scoringBasis: 'Full-time commitment yields higher scores.',
              type: 'standard'
            },
            {
              id: 'q-team-idea-3',
              text: 'Team Composition - Roles / Head Count / Cost.',
              maxScore: 0,
              scoringBasis: 'Not to be scored. Informational only.',
              type: 'no-score'
            }
          ]
        }
        // Additional Idea modules (Market, Biz Model, Financials) will follow this exact pattern
      ]
    },
    
    revenue: {
      id: 'revenue',
      label: 'Revenue Stage',
      modules: [
        {
          id: 'prob-rev',
          topic: 'Clarity of Problem statement',
          weight: 12, // Notice the weight shifts automatically based on stage
          questions: [
            {
              id: 'q-prob-rev-1',
              text: 'What is the problem statement being addressed? How was this problem identified, and what is its background?',
              maxScore: 4, // Max score differs from Idea stage
              scoringBasis: 'Is the problem statement clearly defined with facts/numbers backing it up?',
              type: 'standard'
            },
            {
              id: 'q-prob-rev-2',
              text: 'Do you know how frequently the problem occurs and how painful it is for your target customer?',
              maxScore: 3,
              scoringBasis: 'The impact should be a measurable metric.',
              type: 'standard'
            }
          ]
        },
        {
          id: 'gtm-rev',
          topic: 'GTM Strategy (Go-to-Market Strategy)',
          weight: 12,
          questions: [
            {
              id: 'q-gtm-rev-1',
              text: 'What is the initial target market for the product/service? How was this identified?',
              maxScore: 1,
              scoringBasis: 'Clarity of target segment, justification using research/insights, and logical reasoning for entry market.',
              type: 'standard'
            },
            {
              id: 'q-gtm-rev-2',
              text: 'What are the key channels planned for market entry?',
              maxScore: 1,
              scoringBasis: 'Clarity and feasibility of planned market entry channels (e.g., website, B2B partnerships).',
              type: 'standard'
            }
          ]
        },
        {
          id: 'fin-rev',
          topic: 'Financial Projection and Funding Ask',
          weight: 8,
          questions: [
            {
              id: 'q-fin-rev-1',
              text: 'Mode of Investment Required - Debt/Equity/Grant',
              maxScore: 0,
              scoringBasis: 'Not to be scored.',
              type: 'no-score'
            },
            {
              id: 'q-fin-rev-2',
              text: 'What external funds have been raised so far, if any?',
              maxScore: 1,
              scoringBasis: 'Fund raised = validation. Does not include promoter funding or friends and family.',
              type: 'standard'
            },
            {
              id: 'q-fin-rev-3',
              text: 'How have the raised funds been utilized?',
              maxScore: 2,
              scoringBasis: 'Has the fund utilization brought the startup closer to product launch, customers, or revenue?',
              type: 'standard'
            }
          ]
        }
      ]
    }
  }
};