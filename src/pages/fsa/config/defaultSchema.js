/**
 * src/pages/fsa/config/defaultSchema.js
 * * MASTER ENTERPRISE SCHEMA CONFIGURATION
 * This file contains the foundational structure for Financial Statement Analysis.
 * It defines entity types, exhaustive charts of accounts (P&L, BS, Cash Flow), 
 * dashboard layouts, and core KPI formulas.
 * * PHASE 3: Appended customKPIs and dashboardConfig visibility states.
 */

export const DEFAULT_CONFIG_SCHEMAS = {
  "domains": [
    {
      "id": "default",
      "name": "Standard General"
    }
  ],
  "entityTypes": {
    "pvtLtd": {
      "name": "Private Limited / Corporate",
      "equitySchema": [
        {
          "type": "section",
          "key": "equity",
          "title": "Shareholders' Funds",
          "items": [
            {
              "dataKey": "equityShareCapital",
              "label": "Equity Share Capital",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "preferenceShareCapital",
              "label": "Preference Share Capital",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "securitiesPremium",
              "label": "Securities Premium",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "generalReserve",
              "label": "General Reserve",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "capitalReserve",
              "label": "Capital Reserve",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "retainedEarnings",
              "label": "Retained Earnings / P&L Balance",
              "entityType": "pvtLtd"
            },
            {
              "dataKey": "otherComprehensiveIncome",
              "label": "Other Comprehensive Income",
              "entityType": "pvtLtd"
            }
          ]
        }
      ]
    },
    "partnership": {
      "name": "Partnership Firm",
      "equitySchema": [
        {
          "type": "section",
          "key": "equity",
          "title": "Partners' Capital Accounts",
          "items": [
            {
              "dataKey": "partnerFixedCapital",
              "label": "Partners' Fixed Capital",
              "entityType": "partnership"
            },
            {
              "dataKey": "partnerCurrentAccounts",
              "label": "Partners' Current Accounts",
              "entityType": "partnership"
            },
            {
              "dataKey": "drawings",
              "label": "Less: Drawings (Enter as Negative)",
              "entityType": "partnership"
            }
          ]
        }
      ]
    },
    "soleProprietorship": {
      "name": "Sole Proprietorship",
      "equitySchema": [
        {
          "type": "section",
          "key": "equity",
          "title": "Proprietor's Capital",
          "items": [
            {
              "dataKey": "proprietorCapital",
              "label": "Capital Account Opening Balance",
              "entityType": "soleProprietorship"
            },
            {
              "dataKey": "capitalIntroduced",
              "label": "Add: Capital Introduced",
              "entityType": "soleProprietorship"
            },
            {
              "dataKey": "drawings",
              "label": "Less: Drawings (Enter as Negative)",
              "entityType": "soleProprietorship"
            }
          ]
        }
      ]
    }
  },
  "documents": [
    {
      "id": "pnl",
      "key": "pnl",
      "name": "Profit & Loss Statement"
    },
    {
      "id": "bs",
      "key": "bs",
      "name": "Balance Sheet"
    },
    {
      "id": "cashflow",
      "key": "cashflow",
      "name": "Cash Flow Statement"
    }
  ],
  "chartOfAccounts": {
    "shared": {
      "pnl": [
        {
          "type": "group",
          "key": "income_group",
          "title": "I. INCOME"
        },
        {
          "type": "section",
          "key": "revenue",
          "title": "Revenue from Operations",
          "items": [
            "Sales of Manufactured Goods",
            "Sales of Traded Goods",
            "Sale of Services",
            "Other Operating Revenue",
            "Less: Sales Returns and Discounts (Enter as Negative)",
            "Less: Excise Duty / Taxes (Enter as Negative)"
          ]
        },
        {
          "type": "total",
          "key": "totalrevnue",
          "title": "Total Revenue ",
          "formula": "revenue"
        },
        {
          "type": "section",
          "key": "otherIncome",
          "title": "Other Income",
          "items": [
            "Interest Income on Deposits",
            "Dividend Income",
            "Net Gain on Sale of Investments",
            "Net Gain on Foreign Currency Transactions",
            "Rent Received",
            "Profit on Sale of Fixed Assets",
            "Miscellaneous Non-Operating Income"
          ]
        },
        {
          "type": "total",
          "key": "totalotherincome",
          "title": "Total Other Income",
          "formula": "otherIncome",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "total",
          "key": "totalincome",
          "title": "Total Income",
          "formula": "totalrevnue + totalotherincome",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "group",
          "key": "expenses_group",
          "title": "II. EXPENSES"
        },
        {
          "type": "section",
          "key": "directCosts",
          "title": "Cost of Goods Sold / Direct Expenses",
          "items": [
            "Opening Stock of Raw Materials",
            "Purchases of Raw Materials",
            "Less: Closing Stock of Raw Materials (Enter as Negative)",
            "Purchases of Stock-in-Trade",
            "Changes in Inventories of WIP and Finished Goods",
            "Direct Labor and Factory Wages",
            "Power, Fuel and Water Charges",
            "Freight and Forwarding (Inward)",
            "Consumables and Stores",
            "Other Direct Manufacturing Expenses"
          ]
        },
        {
          "type": "total",
          "key": "totaldirectcosts",
          "title": "Total Direct costs",
          "formula": "directCosts",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "total",
          "key": "grossProfit",
          "title": "Gross Profit",
          "formula": "totalincome - totaldirectcosts"
        },
        {
          "type": "section",
          "key": "empbenefitexp",
          "title": "Employee Benefit Expenses",
          "items": [
            "Salaries, Wages and Bonus",
            "Contribution to Provident and Other Funds",
            "Gratuity Expense",
            "Staff Welfare Expenses",
            "Share Based Payment Expense (ESOP)"
          ]
        },
        {
          "type": "total",
          "key": "totalemployeebenefitexpenses",
          "title": "Total Employee benefit expenses",
          "formula": "empbenefitexp",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "section",
          "key": "otherindirectexpenses",
          "title": "Other Expenses (Indirect & Administrative)",
          "items": [
            "Rent, Rates and Taxes",
            "Repairs and Maintenance - Building",
            "Repairs and Maintenance - Machinery",
            "Repairs and Maintenance - Others",
            "Insurance Expense",
            "Legal and Professional Fees",
            "Payment to Auditors",
            "Marketing, Advertising and Sales Promotion",
            "Freight and Forwarding (Outward)",
            "Travel and Conveyance",
            "Communication and IT Expenses",
            "Printing and Stationery",
            "Bank Charges (Excluding Interest)",
            "Provision for Doubtful Debts / Bad Debts Written Off",
            "Loss on Sale of Assets",
            "Corporate Social Responsibility (CSR) Expenditure",
            "Miscellaneous Expenses"
          ]
        },
        {
          "type": "total",
          "key": "totalindirectexpenses",
          "title": "Total Indirect expenses",
          "formula": "otherindirectexpenses",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "total",
          "key": "ebitda",
          "title": "EBITDA",
          "formula": "grossProfit - empbenefitexp - otherindirectexpenses"
        },
        {
          "type": "section",
          "key": "financeCosts",
          "title": "Finance Costs",
          "items": [
            "Interest on Term Loans",
            "Interest on Working Capital Borrowings",
            "Interest on Lease Liabilities",
            "Other Borrowing Costs and Processing Fees"
          ]
        },
        {
          "type": "total",
          "key": "totalfinancecost",
          "title": "Total Finance cost",
          "formula": "financeCosts",
          "color": "#6366f1",
          "bg": "rgba(99,102,241,0.1)"
        },
        {
          "type": "section",
          "key": "depreciationandammortization",
          "title": "Depreciation & Amortization",
          "items": [
            "Depreciation on Property, Plant & Equipment",
            "Amortization of Intangible Assets",
            "Depreciation on Right-of-Use Assets"
          ]
        },
        {
          "type": "total",
          "key": "ebt",
          "title": "Profit Before Tax (EBT)",
          "formula": "ebitda - totalfinancecost - depreciationandammortization"
        },
        {
          "type": "section",
          "key": "tax",
          "title": "Tax Expenses",
          "items": [
            "Current Tax",
            "Deferred Tax Charge / (Credit)",
            "MAT Credit Entitlement",
            "Taxes for Earlier Years"
          ]
        },
        {
          "type": "total",
          "key": "eat",
          "title": "Profit After Tax (EAT)",
          "formula": "ebt - tax",
          "bg": "rgba(16, 185, 129, 0.1)",
          "color": "#10b981"
        }
      ],
      "bs": [
        {
          "type": "group",
          "key": "assets_group",
          "title": "I. ASSETS"
        },
        {
          "type": "section",
          "key": "nonCurrentAssets",
          "title": "Non-Current Assets",
          "items": [
            "Property, Plant and Equipment",
            "Capital Work-in-Progress",
            "Right-of-Use Assets",
            "Investment Property",
            "Goodwill",
            "Other Intangible Assets",
            "Intangible Assets Under Development",
            "Non-Current Investments",
            "Long-term Loans and Advances",
            "Other Non-Current Financial Assets",
            "Deferred Tax Assets (Net)",
            "Other Non-Current Assets"
          ]
        },
        {
          "type": "section",
          "key": "currentAssets",
          "title": "Current Assets",
          "items": [
            "Current Investments",
            "Inventories",
            "Trade Receivables",
            "Less: Provision for Doubtful Debts (Enter as Negative)",
            "Cash and Cash Equivalents",
            "Bank Balances other than Cash Equivalents",
            "Short-term Loans and Advances",
            "Other Current Financial Assets",
            "Current Tax Assets (Net)",
            "Other Current Assets"
          ]
        },
        {
          "type": "total",
          "key": "totalAssets",
          "title": "Total Assets",
          "formula": [
            {
              "section": "nonCurrentAssets",
              "sign": 1
            },
            {
              "section": "currentAssets",
              "sign": 1
            }
          ],
          "bg": "rgba(99, 102, 241, 0.1)",
          "color": "#6366f1"
        },
        {
          "type": "group",
          "key": "liabilities_group",
          "title": "II. EQUITY AND LIABILITIES"
        },
        {
          "dynamic": true,
          "key": "equity_placeholder"
        },
        {
          "type": "section",
          "key": "nonCurrentLiabilities",
          "title": "Non-Current Liabilities",
          "items": [
            "Long-term Borrowings",
            "Lease Liabilities (Non-Current)",
            "Deferred Tax Liabilities (Net)",
            "Long-term Provisions",
            "Other Non-Current Financial Liabilities",
            "Other Non-Current Liabilities"
          ]
        },
        {
          "type": "section",
          "key": "currentliablities",
          "title": "Current Liabilities",
          "items": [
            "Short-term Borrowings",
            "Current Maturities of Long-term Debt",
            "Lease Liabilities (Current)",
            "Trade Payables (Micro and Small Enterprises)",
            "Trade Payables (Other)",
            "Other Current Financial Liabilities",
            "Other Current Liabilities",
            "Short-term Provisions",
            "Current Tax Liabilities (Net)"
          ]
        },
        {
          "type": "total",
          "key": "totalLE",
          "title": "Total Equity & Liabilities",
          "formula": [
            {
              "section": "equity",
              "sign": 1
            },
            {
              "section": "nonCurrentLiabilities",
              "sign": 1
            },
            {
              "section": "currentliablities",
              "sign": 1
            }
          ],
          "bg": "rgba(99, 102, 241, 0.1)",
          "color": "#6366f1"
        }
      ],
      "cashflow": [
        {
          "type": "group",
          "key": "cf_op_group",
          "title": "A. Cash Flow from Operating Activities"
        },
        {
          "type": "total",
          "key": "cf_ebt",
          "title": "Net Profit Before Tax (Auto-fetched from P&L)",
          "formula": [
            {
              "doc": "pnl",
              "section": "ebt",
              "sign": 1
            }
          ]
        },
        {
          "type": "total",
          "key": "cf_dna",
          "title": "Add: Depreciation & Amortization (Auto-fetched)",
          "formula": [
            {
              "doc": "pnl",
              "section": "depreciationandammortization",
              "sign": 1
            }
          ]
        },
        {
          "type": "total",
          "key": "cf_interest",
          "title": "Add: Finance Costs (Auto-fetched)",
          "formula": [
            {
              "doc": "pnl",
              "section": "financeCosts",
              "sign": 1
            }
          ]
        },
        {
          "type": "total",
          "key": "cf_op_before_wc",
          "title": "Operating Profit Before Working Capital Changes",
          "formula": [
            {
              "section": "cf_ebt",
              "sign": 1
            },
            {
              "section": "cf_dna",
              "sign": 1
            },
            {
              "section": "cf_interest",
              "sign": 1
            }
          ],
          "bg": "rgba(255, 255, 255, 0.05)"
        },
        {
          "type": "section",
          "key": "cf_wc_changes",
          "title": "Working Capital Changes (Enter Net Variances)",
          "items": [
            "Decrease / (Increase) in Trade Receivables",
            "Decrease / (Increase) in Inventories",
            "Decrease / (Increase) in Other Current Assets",
            "Increase / (Decrease) in Trade Payables",
            "Increase / (Decrease) in Other Current Liabilities",
            "Increase / (Decrease) in Provisions"
          ]
        },
        {
          "type": "section",
          "key": "cf_tax_paid",
          "title": "Direct Taxes",
          "items": [
            "Direct Taxes Paid (Net of Refunds) (Enter as Negative)"
          ]
        },
        {
          "type": "total",
          "key": "cf_op_net",
          "title": "Net Cash from Operating Activities (A)",
          "formula": [
            {
              "section": "cf_op_before_wc",
              "sign": 1
            },
            {
              "section": "cf_wc_changes",
              "sign": 1
            },
            {
              "section": "cf_tax_paid",
              "sign": 1
            }
          ],
          "bg": "rgba(16, 185, 129, 0.1)",
          "color": "#10b981"
        },
        {
          "type": "group",
          "key": "cf_inv_group",
          "title": "B. Cash Flow from Investing Activities"
        },
        {
          "type": "section",
          "key": "cf_inv_items",
          "title": "Investing Cash Flows",
          "items": [
            "Purchase of Property, Plant & Equipment (Enter as Negative)",
            "Sale of Property, Plant & Equipment",
            "Purchase of Investments (Enter as Negative)",
            "Sale of Investments",
            "Interest Received",
            "Dividend Received",
            "Movement in Bank Balances Not Considered Cash Equivalents"
          ]
        },
        {
          "type": "total",
          "key": "cf_inv_net",
          "title": "Net Cash from Investing Activities (B)",
          "formula": [
            {
              "section": "cf_inv_items",
              "sign": 1
            }
          ],
          "bg": "rgba(59, 130, 246, 0.1)",
          "color": "#3b82f6"
        },
        {
          "type": "group",
          "key": "cf_fin_group",
          "title": "C. Cash Flow from Financing Activities"
        },
        {
          "type": "section",
          "key": "cf_fin_items",
          "title": "Financing Cash Flows",
          "items": [
            "Proceeds from Issue of Share Capital",
            "Proceeds from Long-term Borrowings",
            "Repayment of Long-term Borrowings (Enter as Negative)",
            "Short-term Borrowings (Net variance)",
            "Dividends Paid (Enter as Negative)"
          ]
        },
        {
          "type": "total",
          "key": "cf_interest_paid",
          "title": "Less: Interest Paid (Auto-fetched from P&L)",
          "formula": [
            {
              "doc": "pnl",
              "section": "financeCosts",
              "sign": -1
            }
          ]
        },
        {
          "type": "total",
          "key": "cf_fin_net",
          "title": "Net Cash from Financing Activities (C)",
          "formula": [
            {
              "section": "cf_fin_items",
              "sign": 1
            },
            {
              "section": "cf_interest_paid",
              "sign": 1
            }
          ],
          "bg": "rgba(139, 92, 246, 0.1)",
          "color": "#8b5cf6"
        },
        {
          "type": "group",
          "key": "cf_summary_group",
          "title": "Net Increase / Decrease in Cash"
        },
        {
          "type": "total",
          "key": "cf_net_change",
          "title": "Net Change in Cash & Equivalents (A + B + C)",
          "formula": [
            {
              "section": "cf_op_net",
              "sign": 1
            },
            {
              "section": "cf_inv_net",
              "sign": 1
            },
            {
              "section": "cf_fin_net",
              "sign": 1
            }
          ]
        },
        {
          "type": "section",
          "key": "cf_opening",
          "title": "Opening Balance",
          "items": [
            "Cash & Cash Equivalents at Beginning of Year"
          ]
        },
        {
          "type": "total",
          "key": "cf_closing",
          "title": "Cash & Cash Equivalents at End of Year",
          "formula": [
            {
              "section": "cf_net_change",
              "sign": 1
            },
            {
              "section": "cf_opening",
              "sign": 1
            }
          ],
          "bg": "rgba(99, 102, 241, 0.15)",
          "color": "#6366f1"
        }
      ]
    }
  },
  "crossDocLinks": [
    {
      "fromDoc": "pnl",
      "fromSection": "eat",
      "toDoc": "bs",
      "toSection": "equity",
      "toItem": "retainedEarnings"
    }
  ],
  "metricsFormulas": [
    {
      "key": "grossMargin",
      "label": "Gross Margin (%)",
      "formula": "grossProfit / revenue",
      "isPercentage": true
    },
    {
      "key": "ebitdaMargin",
      "label": "EBITDA Margin (%)",
      "formula": "ebitda / revenue",
      "isPercentage": true
    },
    {
      "key": "netMargin",
      "label": "Net Profit Margin (%)",
      "formula": "eat / revenue",
      "isPercentage": true
    },
    {
      "key": "roe",
      "label": "Return on Equity (ROE)",
      "formula": "eat / equity",
      "isPercentage": true
    },
    {
      "key": "roa",
      "label": "Return on Assets (ROA)",
      "formula": "eat / totalAssets",
      "isPercentage": true
    }
  ],
  "customRatios": [
    {
      "key": "current_ratio",
      "name": "Current Ratio",
      "numerator": [
        "currentAssets"
      ],
      "denominator": [
        "currentliablities"
      ],
      "isPercentage": false
    },
    {
      "key": "debt_to_equity",
      "name": "Debt to Equity Ratio",
      "numerator": [
        "nonCurrentLiabilities",
        "Short-term Borrowings"
      ],
      "denominator": [
        "equity"
      ],
      "isPercentage": false
    }
  ],
  "customKPIs": [
    {
      "key": "working_capital",
      "label": "Working Capital",
      "formula": "currentAssets - currentliablities",
      "isPercentage": false
    }
  ],
  "dashboardConfig": {
    "visibleKPIs": [
      "revenue",
      "grossProfit",
      "ebitda",
      "eat",
      "totalAssets",
      "equity",
      "working_capital"
    ],
    "charts": [
      {
        "id": "chart_1",
        "title": "Revenue vs Profitability (EBITDA & EAT)",
        "type": "combo",
        "datasets": [
          "revenue",
          "ebitda",
          "eat"
        ],
        "isVisible": true
      },
      {
        "id": "chart_2",
        "title": "Asset & Liability Composition",
        "type": "bar",
        "datasets": [
          "totalAssets",
          "totalLE"
        ],
        "isVisible": true
      },
      {
        "id": "chart_3",
        "title": "Operating Cash Flow vs Net Profit",
        "type": "combo",
        "datasets": [
          "eat",
          "cf_op_net"
        ],
        "isVisible": true
      }
    ]
  },
  "confidenceThresholds": {
    "high": 0.85,
    "medium": 0.7
  }
}