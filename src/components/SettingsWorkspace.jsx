"use client";
import BackupStorageSettings from "./BackupStorageSettings";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  DatabaseBackup,
  Download,
  FileText,
  HardDrive,
  History,
  LoaderCircle,
  LockKeyhole,
  PackageOpen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { GST_STATES } from "@/lib/gst-states";
import { calculateSalePricing } from "@/services/pricing.service";

const sectionGroups = [
  {
    label: "General",
    items: [
      {
        id: "store",
        label: "Store & Business",
        icon: Building2,
        keywords: "business legal logo currency timezone gstin",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        id: "checkout",
        label: "Checkout",
        icon: ShoppingCart,
        keywords: "customer held cart cancellation",
      },
      {
        id: "payments",
        label: "Payments",
        icon: WalletCards,
        keywords: "cash upi bank split reference change",
      },
      {
        id: "pricing",
        label: "Discount & Rounding",
        icon: CircleDollarSign,
        keywords: "discount percentage fixed approval round",
      },
      {
        id: "gst",
        label: "GST & Tax",
        icon: FileText,
        keywords: "gst tax hsn cgst sgst igst state inclusive exclusive",
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        id: "inventory",
        label: "Inventory Rules",
        icon: PackageOpen,
        keywords: "stock negative reorder open",
      },
      {
        id: "batchExpiry",
        label: "Batch & Expiry",
        icon: TriangleAlert,
        keywords: "batch expiry fefo warning expired",
      },
      {
        id: "looseSales",
        label: "Loose Sales",
        icon: SlidersHorizontal,
        keywords: "ml grams tablets quantity pricing",
      },
      {
        id: "customMix",
        label: "Custom Mix",
        icon: Settings2,
        keywords: "mixture ingredient packaging compatible",
      },
    ],
  },
  {
    label: "Documents",
    items: [
      {
        id: "invoice",
        label: "Invoice",
        icon: FileText,
        keywords: "number prefix format footer ingredients",
      },
      {
        id: "receipt",
        label: "Thermal Receipt",
        icon: Printer,
        keywords: "58mm 80mm auto print footer",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        id: "purchases",
        label: "Purchases & Expenses",
        icon: ShoppingCart,
        keywords: "supplier purchase partial unpaid free expense",
      },
      {
        id: "customers",
        label: "Customers",
        icon: Users,
        keywords: "walk-in duplicate phone email required",
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        keywords: "low stock expiry due adjustment",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        id: "security",
        label: "Security",
        icon: ShieldCheck,
        keywords: "password session timeout logout",
      },
      {
        id: "backup",
        label: "Backups",
        icon: DatabaseBackup,
        keywords: "automatic manual database archive download recovery",
      },
      {
        id: "audit",
        label: "Audit Log",
        icon: History,
        keywords: "history changes staff old new",
      },
      {
        id: "danger",
        label: "Danger Zone",
        icon: TriangleAlert,
        keywords: "reset defaults",
      },
    ],
  },
];
const sections = sectionGroups.flatMap((group) => group.items);
const gstRates = [
  ["0", "0%"],
  ["3", "3%"],
  ["5", "5%"],
  ["12", "12%"],
  ["18", "18%"],
  ["28", "28%"],
  ["CUSTOM", "Custom"],
];
const get = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);
const set = (object, path, value) => {
  const next = structuredClone(object),
    parts = path.split(".");
  let target = next;
  for (const part of parts.slice(0, -1)) {
    target[part] ??= {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
  if (path === "store.gstin") {
    const stateCode = String(value || "")
      .trim()
      .slice(0, 2);
    if (gstStateCodes.has(stateCode)) next.store.stateCode = stateCode;
  }
  if (path === "gst.cartRatePreset" && value !== "CUSTOM")
    next.gst.cartRate = Number(value);
  if (path === "gst.defaultRatePreset" && value !== "CUSTOM")
    next.gst.defaultRate = Number(value);
  if (path === "gst.displayStyle")
    next.gst.showDetailedBreakdown = value === "DETAILED";
  return next;
};
const gstStateCodes = new Set(GST_STATES.map(([code]) => code));
async function api(url, options) {
  const response = await fetch(url, options),
    body = await response.json();
  if (!response.ok) {
    const details = body.details || {},
      firstError = Object.values(details).find(Boolean),
      error = new Error(firstError || body.error || "Unable to save Settings.");
    error.details = details;
    throw error;
  }
  return body.data;
}

const configs = {
  store: {
    title: "Store & Business",
    description:
      "Business identity used across invoices, receipts and reports.",
    groups: [
      {
        title: "Business details",
        fields: [
          { path: "store.name", label: "Store name", required: true },
          { path: "store.legalName", label: "Business / legal name" },
          { path: "store.phone", label: "Phone" },
          { path: "store.email", label: "Email", type: "email" },
          { path: "store.gstin", label: "GSTIN" },
          { path: "store.address", label: "Address", type: "textarea" },
          {
            path: "store.currency",
            label: "Currency",
            type: "select",
            options: [["INR", "INR — ₹"]],
          },
          {
            path: "store.timezone",
            label: "Timezone",
            type: "select",
            options: [["Asia/Kolkata", "Asia/Kolkata"]],
          },
          {
            path: "store.logoUrl",
            label: "Store logo URL",
            note: "Use a managed image URL; secrets and large image data are never stored in Settings.",
          },
        ],
      },
    ],
  },
  checkout: {
    title: "Checkout",
    description: "Customer defaults and cashier cart behavior.",
    groups: [
      {
        title: "Customer at checkout",
        fields: [
          {
            path: "checkout.defaultWalkInCustomer",
            label: "Default to Walk-in Customer",
            type: "toggle",
          },
          {
            path: "checkout.requireCustomerSelection",
            label: "Require customer selection",
            type: "toggle",
          },
          {
            path: "customers.requireName",
            label: "Require name for new customer",
            type: "toggle",
          },
          {
            path: "customers.requirePhone",
            label: "Require phone",
            type: "toggle",
          },
          {
            path: "customers.requireEmail",
            label: "Require email",
            type: "toggle",
          },
          {
            path: "customers.requireAddress",
            label: "Require address",
            type: "toggle",
          },
        ],
      },
      {
        title: "Checkout behavior",
        fields: [
          {
            path: "checkout.allowHeldSales",
            label: "Allow held sales",
            type: "toggle",
          },
          {
            path: "checkout.allowResumeHeldSale",
            label: "Allow resume held sale",
            type: "toggle",
          },
          {
            path: "checkout.allowCartClear",
            label: "Allow clear cart",
            type: "toggle",
          },
          {
            path: "checkout.allowQuantityEdit",
            label: "Allow quantity edit",
            type: "toggle",
          },
          {
            path: "checkout.allowItemRemoval",
            label: "Allow item removal",
            type: "toggle",
          },
          {
            path: "checkout.allowCustomerChange",
            label: "Allow customer change",
            type: "toggle",
          },
          {
            path: "checkout.cancellationPermission",
            label: "Sale cancellation permission",
            type: "select",
            options: [
              ["ADMIN", "Administrator Only"],
              ["MANAGER", "Manager + Administrator"],
              ["PERMISSION", "Role Permission"],
            ],
          },
        ],
      },
    ],
  },
  pricing: {
    title: "Discount & Rounding",
    description:
      "Control discount availability, staff permissions and final amount rounding.",
    groups: [
      {
        title: "Discount Availability",
        fields: [
          {
            path: "discount.enabled",
            label: "Enable Discounts",
            type: "toggle",
            note: "When off, discount controls are hidden from sales and rejected by the backend.",
          },
          {
            path: "discount.showInCart",
            label: "Show Discount in Cart",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.showInCheckout",
            label: "Show Discount in Checkout",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.showOnInvoice",
            label: "Show Discount on Invoice",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.showOnReceipt",
            label: "Show Discount on Thermal Receipt",
            type: "toggle",
            requiresDiscount: true,
          },
        ],
      },
      {
        title: "Discount Types & Limits",
        fields: [
          {
            path: "discount.allowPercentage",
            label: "Allow Percentage Discount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.maxPercentage",
            label: "Maximum Percentage",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
          },
          {
            path: "discount.allowFixed",
            label: "Allow Fixed Amount Discount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.maxFixedAmount",
            label: "Maximum Fixed Discount",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
          },
          {
            path: "discount.allowCustomAmount",
            label: "Allow Custom Discount Amount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowQuickPresets",
            label: "Allow Quick Discount Presets",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.percentagePresets",
            label: "Percentage Presets",
            type: "numberList",
            note: "Comma-separated percentages used by Cart and Checkout.",
            requiresDiscount: true,
            when: "discount.allowQuickPresets",
          },
          {
            path: "discount.fixedPresets",
            label: "Fixed Presets",
            type: "numberList",
            note: "Comma-separated rupee values used by Cart and Checkout.",
            requiresDiscount: true,
            when: "discount.allowQuickPresets",
          },
        ],
      },
      {
        title: "Discount Scope",
        fields: [
          {
            path: "discount.itemLevel",
            label: "Allow Item-level Discount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.cartLevel",
            label: "Allow Cart-level Discount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.categoryLevel",
            label: "Allow Category-level Discount",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowLooseItems",
            label: "Allow discount on loose-sale items",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowCustomMixItems",
            label: "Allow discount on custom-mix items",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowAlreadyDiscounted",
            label: "Allow already discounted products",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowTaxExempt",
            label: "Allow tax-exempt products",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.totalLimitType",
            label: "Maximum Total Discount Per Sale",
            type: "select",
            options: [
              ["NONE", "No additional limit"],
              ["PERCENTAGE", "Percentage of cart"],
              ["FIXED", "Fixed maximum value"],
            ],
            requiresDiscount: true,
          },
          {
            path: "discount.totalLimitPercentage",
            label: "Maximum Total Percentage",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
            whenValue: ["discount.totalLimitType", "PERCENTAGE"],
          },
          {
            path: "discount.totalLimitFixed",
            label: "Maximum Total Value",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
            whenValue: ["discount.totalLimitType", "FIXED"],
          },
        ],
      },
      {
        title: "Discount Permissions & Approval",
        fields: [
          {
            path: "discount.allowOwner",
            label: "Allow Owner",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowAdmin",
            label: "Allow Admin",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.allowStaff",
            label: "Allow Staff",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.staffMaxPercentage",
            label: "Staff Maximum Percentage",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
          },
          {
            path: "discount.staffMaxFixed",
            label: "Staff Maximum Fixed",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
          },
          {
            path: "discount.approvalPercentage",
            label: "Require Approval Above",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
          },
          {
            path: "discount.approvalFixedAmount",
            label: "Require Approval Above Fixed",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
          },
          {
            path: "discount.approvalMethod",
            label: "Approval Method",
            type: "select",
            options: [
              ["ADMIN_PIN", "Admin PIN — Recommended"],
              ["ADMIN_LOGIN", "Admin Login"],
              ["OWNER_ONLY", "Owner Only"],
              ["NONE", "No Approval"],
            ],
            requiresDiscount: true,
          },
        ],
      },
      {
        title: "Discount Rules",
        fields: [
          {
            path: "discount.allowStacking",
            label: "Allow Item + Cart Discount Together",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.maximumCombinedPercentage",
            label: "Maximum Combined Discount",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
            when: "discount.allowStacking",
          },
          {
            path: "discount.minimumPurchaseEnabled",
            label: "Enable Minimum Purchase Rule",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.minimumPurchaseAmount",
            label: "Minimum Cart Amount",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
            when: "discount.minimumPurchaseEnabled",
          },
          {
            path: "discount.minimumPurchaseBasis",
            label: "Calculate Minimum Based On",
            type: "select",
            options: [
              ["SUBTOTAL", "Subtotal before discount — Recommended"],
              ["TAXABLE", "Taxable amount"],
              ["FINAL", "Final amount"],
            ],
            requiresDiscount: true,
            when: "discount.minimumPurchaseEnabled",
          },
        ],
      },
      {
        title: "Discount Reasons",
        fields: [
          {
            path: "discount.requireReason",
            label: "Require Discount Reason",
            type: "toggle",
            requiresDiscount: true,
          },
          {
            path: "discount.reasonType",
            label: "Reason Type",
            type: "select",
            options: [
              ["PREDEFINED", "Select from predefined reasons"],
              ["CUSTOM", "Allow custom reason"],
              ["BOTH", "Predefined and custom"],
            ],
            requiresDiscount: true,
          },
          {
            path: "discount.reasons",
            label: "Reasons",
            type: "reasonList",
            requiresDiscount: true,
          },
        ],
      },
      {
        title: "Automatic Discount Behaviour",
        fields: [
          {
            path: "discount.automaticEnabled",
            label: "Enable Automatic Discounts",
            type: "toggle",
            requiresDiscount: true,
            note: "Optional simple threshold rule; off by default.",
          },
          {
            path: "discount.automaticAbove",
            label: "Apply automatically above",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
            when: "discount.automaticEnabled",
          },
          {
            path: "discount.automaticPercentage",
            label: "Automatic Discount",
            type: "number",
            suffix: "%",
            requiresDiscount: true,
            when: "discount.automaticEnabled",
          },
          {
            path: "discount.automaticMaximum",
            label: "Maximum Automatic Discount",
            type: "number",
            prefix: "₹",
            requiresDiscount: true,
            when: "discount.automaticEnabled",
          },
          {
            path: "discount.preventAutomaticWithManual",
            label: "Do not combine with manual discount",
            type: "toggle",
            requiresDiscount: true,
            when: "discount.automaticEnabled",
          },
        ],
      },
      {
        title: "Round Off",
        fields: [
          {
            path: "roundOff.enabled",
            label: "Enable Round Off",
            type: "toggle",
          },
          {
            path: "roundOff.applyTo",
            label: "Round Off Applies To",
            type: "select",
            options: [
              ["GRAND_TOTAL", "Final Grand Total — Recommended"],
              ["SUBTOTAL", "Subtotal"],
            ],
            requiresRoundOff: true,
          },
          {
            path: "roundOff.method",
            label: "Round-off Method",
            type: "select",
            options: [
              ["NEAREST", "Nearest Value"],
              ["UP", "Round Up"],
              ["DOWN", "Round Down"],
            ],
            requiresRoundOff: true,
          },
          {
            path: "roundOff.precision",
            label: "Round To",
            type: "select",
            options: [
              ["0.05", "₹0.05"],
              ["0.1", "₹0.10"],
              ["0.5", "₹0.50"],
              ["1", "₹1.00"],
              ["5", "₹5.00"],
              ["CUSTOM", "Custom"],
            ],
            requiresRoundOff: true,
          },
          {
            path: "roundOff.customPrecision",
            label: "Custom Round To",
            type: "number",
            prefix: "₹",
            requiresRoundOff: true,
            whenValue: ["roundOff.precision", "CUSTOM"],
          },
          {
            path: "roundOff.paymentScope",
            label: "Payment Behaviour",
            type: "select",
            options: [
              ["ALL", "Apply to all payments"],
              ["CASH", "Cash payments only"],
              ["NONE", "Do not modify payment amount"],
            ],
            requiresRoundOff: true,
          },
          {
            path: "roundOff.maxAdjustment",
            label: "Maximum Allowed Adjustment",
            type: "number",
            prefix: "₹",
            requiresRoundOff: true,
          },
          {
            path: "roundOff.showInCart",
            label: "Show Round Off in Cart",
            type: "toggle",
            requiresRoundOff: true,
          },
          {
            path: "roundOff.showInCheckout",
            label: "Show Round Off in Checkout",
            type: "toggle",
            requiresRoundOff: true,
          },
          {
            path: "roundOff.showOnInvoice",
            label: "Show Round Off on Invoice",
            type: "toggle",
            requiresRoundOff: true,
          },
          {
            path: "roundOff.showOnReceipt",
            label: "Show Round Off on Thermal Receipt",
            type: "toggle",
            requiresRoundOff: true,
          },
        ],
      },
      {
        title: "Calculation Order",
        fields: [
          {
            path: "discount.calculationOrder",
            label: "Discount Calculation Order",
            type: "radioCards",
            requiresDiscount: true,
            options: [
              [
                "ITEM_THEN_CART",
                "Item discount → Cart discount",
                "Then GST → Round Off → Grand Total",
                "Recommended",
              ],
              [
                "CART_ONLY",
                "Cart discount only",
                "Ignore item-level discounts for the sale.",
              ],
            ],
          },
        ],
      },
      {
        title: "Calculation Preview",
        fields: [
          {
            path: "discount.preview",
            label: "Preview",
            type: "pricingPreview",
          },
        ],
      },
    ],
  },
  gst: {
    title:"GST & Tax",
    description:"Use commercial invoices while unregistered. Registration changes apply only to new invoices.",
    groups:[
      {title:"Registration",fields:[
        {path:"gst.registrationStatus",label:"GST registration status",type:"select",options:[["UNREGISTERED","Not registered"],["REGULAR","Regular taxpayer"],["COMPOSITION","Composition taxpayer"],["INACTIVE","Inactive registration"]]},
        {path:"gst.enabled",label:"Collect GST (regular registration only)",type:"toggle",note:"Keep off while unregistered or under composition. New GST invoices require a verified registration profile."},
        {path:"store.legalName",label:"Legal business name"},
        {path:"store.address",label:"Business address",type:"textarea"},
        {path:"store.gstin",label:"GSTIN",note:"Format and checksum are checked. They do not establish active registration."},
        {path:"store.stateCode",label:"State / UT",type:"select",options:GST_STATES},
        {path:"gst.effectiveFrom",label:"Registration effective from",note:"YYYY-MM-DD"},
        {path:"gst.effectiveTo",label:"Registration effective until (optional)",note:"YYYY-MM-DD"},
        {path:"gst.verificationReference",label:"Registration verification reference",note:"Record the GST Portal check or professional verification reference and date."},
        {path:"gst.precedingYearTurnover",label:"Preceding financial year turnover",type:"number",note:"PAN-level aggregate turnover, in rupees."},
        {path:"gst.highestTurnover",label:"Highest annual turnover since FY 2017–18",type:"number",note:"Used to prevent issuing documents that need an unsupported IRP/QR workflow."}
      ]},
      {title:"Price treatment",fields:[
        {path:"gst.priceMode",label:"Store price mode",type:"select",options:[["INCLUSIVE","GST inclusive"],["EXCLUSIVE","GST exclusive"]]},
        {path:"gst.defaultRate",label:"New-product default rate",type:"number",note:"Existing products retain their own rates. Verify classification before GST billing."}
      ]},
      {title:"Checkout display",fields:[
        {path:"gst.showInCart",label:"Show tax in cart",type:"toggle"},
        {path:"gst.showInCheckout",label:"Show tax at checkout",type:"toggle"},
        {path:"gst.showDetailedBreakdown",label:"Detailed checkout breakdown",type:"toggle",note:"Required invoice particulars always print."}
      ]}
    ]
  },
  inventory: {
    title: "Inventory Rules",
    description: "System-wide physical stock and open-package behavior.",
    groups: [
      {
        title: "Stock protection",
        fields: [
          {
            path: "inventory.preventOutOfStockSale",
            label: "Prevent out-of-stock sale",
            type: "toggle",
          },
          {
            path: "inventory.allowNegativeStock",
            label: "Allow negative stock",
            type: "toggle",
          },
          {
            path: "inventory.showLowStockWarning",
            label: "Show low stock warning",
            type: "toggle",
          },
          {
            path: "inventory.lowStockAlerts",
            label: "Enable low stock alerts",
            type: "toggle",
          },
          {
            path: "inventory.productReorderLevel",
            label: "Allow product-level reorder level",
            type: "toggle",
          },
          {
            path: "inventory.defaultReorderPercentage",
            label: "Default reorder percentage",
            type: "number",
            suffix: "%",
          },
        ],
      },
      {
        title: "Open package inventory",
        fields: [
          {
            path: "inventory.trackOpenPackages",
            label: "Track open packages",
            type: "toggle",
          },
          {
            path: "inventory.useOpenStockFirst",
            label: "Use existing open stock first",
            type: "toggle",
            when: "inventory.trackOpenPackages",
          },
          {
            path: "inventory.autoOpenPackage",
            label: "Auto open a package when needed",
            type: "toggle",
            when: "inventory.trackOpenPackages",
          },
          {
            path: "inventory.useOldestValidBatchFirst",
            label: "Use oldest valid batch first",
            type: "toggle",
          },
        ],
      },
    ],
  },
  batchExpiry: {
    title: "Batch & Expiry",
    description: "Batch integrity, FEFO selection and expiry protection.",
    groups: [
      {
        title: "Batch tracking",
        fields: [
          {
            path: "batchExpiry.batchTracking",
            label: "Enable batch tracking",
            type: "toggle",
          },
          {
            path: "batchExpiry.requireBatchOnPurchase",
            label: "Require batch on purchase",
            type: "toggle",
            when: "batchExpiry.batchTracking",
          },
          {
            path: "batchExpiry.allowMultipleBatches",
            label: "Allow multiple active batches",
            type: "toggle",
            when: "batchExpiry.batchTracking",
          },
        ],
      },
      {
        title: "Expiry management",
        fields: [
          {
            path: "batchExpiry.expiryTracking",
            label: "Enable expiry tracking",
            type: "toggle",
          },
          {
            path: "batchExpiry.requireExpiryOnPurchase",
            label: "Require expiry on medicine purchase",
            type: "toggle",
            when: "batchExpiry.expiryTracking",
          },
          {
            path: "batchExpiry.blockExpiredSales",
            label: "Block expired product sales",
            type: "toggle",
            when: "batchExpiry.expiryTracking",
          },
          {
            path: "batchExpiry.useEarliestExpiryFirst",
            label: "Use earliest expiring valid batch first",
            type: "toggle",
            when: "batchExpiry.expiryTracking",
          },
          {
            path: "batchExpiry.firstWarningDays",
            label: "First warning",
            type: "number",
            suffix: "days",
            when: "batchExpiry.expiryTracking",
          },
          {
            path: "batchExpiry.importantWarningDays",
            label: "Important warning",
            type: "number",
            suffix: "days",
            when: "batchExpiry.expiryTracking",
          },
          {
            path: "batchExpiry.criticalWarningDays",
            label: "Critical warning",
            type: "number",
            suffix: "days",
            when: "batchExpiry.expiryTracking",
          },
        ],
      },
    ],
  },
  looseSales: {
    title: "Loose Sales",
    description:
      "Global loose-sale availability and unit-specific quick quantities.",
    groups: [
      {
        title: "Loose sales",
        fields: [
          {
            path: "looseSales.enabled",
            label: "Enable loose sales",
            type: "toggle",
          },
          {
            path: "looseSales.allowCustomQuantity",
            label: "Allow custom loose quantity",
            type: "toggle",
            when: "looseSales.enabled",
          },
          {
            path: "looseSales.showQuickQuantities",
            label: "Show quick quantities",
            type: "toggle",
            when: "looseSales.enabled",
          },
          {
            path: "looseSales.pricingMethod",
            label: "Default loose pricing",
            type: "select",
            when: "looseSales.enabled",
            options: [
              ["PRODUCT", "Product-defined pricing"],
              ["PROPORTIONAL", "Proportional package rate"],
            ],
          },
          {
            path: "looseSales.quickQuantities.ml",
            label: "ml quick quantities",
            type: "numberList",
            when: "looseSales.showQuickQuantities",
          },
          {
            path: "looseSales.quickQuantities.g",
            label: "g quick quantities",
            type: "numberList",
            when: "looseSales.showQuickQuantities",
          },
          {
            path: "looseSales.quickQuantities.tablets",
            label: "Tablet quick quantities",
            type: "numberList",
            when: "looseSales.showQuickQuantities",
          },
          {
            path: "looseSales.quickQuantities.pcs",
            label: "Piece quick quantities",
            type: "numberList",
            when: "looseSales.showQuickQuantities",
          },
        ],
      },
    ],
  },
  customMix: {
    title: "Custom Mix",
    description:
      "Compatibility, pricing, packaging and stock validation for on-demand mixtures.",
    groups: [
      {
        title: "Availability",
        fields: [
          {
            path: "customMix.enabled",
            label: "Enable Custom Mix",
            type: "toggle",
          },
          {
            path: "customMix.bottleRequired",
            label: "Packaging required",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.autoSuggestBottle",
            label: "Suggest packaging",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.allowCustomLabel",
            label: "Allow custom mix label",
            type: "toggle",
            when: "customMix.enabled",
          },
        ],
      },
      {
        title: "Compatibility & validation",
        fields: [
          {
            path: "customMix.sameBaseUnitOnly",
            label: "Require same base unit",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.requireMixEnabledProduct",
            label: "Require mix-enabled products",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.minIngredients",
            label: "Minimum ingredients",
            type: "number",
            when: "customMix.enabled",
          },
          {
            path: "customMix.maxIngredients",
            label: "Maximum ingredients",
            type: "number",
            when: "customMix.enabled",
          },
          {
            path: "customMix.preventInsufficientStock",
            label: "Prevent mix if stock is insufficient",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.validateEveryIngredient",
            label: "Validate every ingredient",
            type: "toggle",
            when: "customMix.enabled",
          },
          {
            path: "customMix.ingredientPricingMethod",
            label: "Ingredient pricing",
            type: "select",
            when: "customMix.enabled",
            options: [
              ["LOOSE_PRICE", "Use product loose price"],
              ["CALCULATED", "Use calculated unit rate"],
            ],
          },
          {
            path: "customMix.markupPercentage",
            label: "Custom mix markup",
            type: "number",
            suffix: "%",
            when: "customMix.enabled",
          },
        ],
      },
    ],
  },
  invoice: {
    title: "Invoice",
    description:
      "Future invoice numbering and printed content. Historical invoices remain unchanged.",
    groups: [
      {
        title: "Invoice numbering",
        fields: [
          { path: "invoice.prefix", label: "Invoice prefix", required: true },
          {
            path: "invoice.format",
            label: "Number format",
            note: "Supported: {PREFIX}, {YYYY}, {YY}, {MM}, {DD}, {YYYYMMDD}, {NUMBER}",
          },
          {
            path: "invoice.nextNumber",
            label: "Starting / next number",
            type: "number",
          },
        ],
      },
      {
        title: "Invoice content",
        fields: [
          {
            path: "invoice.showStoreName",
            label: "Show store name",
            type: "toggle",
          },
          {
            path: "invoice.showStoreAddress",
            label: "Show store address",
            type: "toggle",
          },
          { path: "invoice.showPhone", label: "Show phone", type: "toggle" },
          { path: "invoice.showGSTIN", label: "Show GSTIN", type: "toggle" },
          {
            path: "invoice.showCustomerName",
            label: "Show customer name",
            type: "toggle",
          },
          {
            path: "invoice.showCustomerPhone",
            label: "Show customer phone",
            type: "toggle",
          },
          {
            path: "invoice.showCashier",
            label: "Show cashier name",
            type: "toggle",
          },
          {
            path: "invoice.showPaymentMethod",
            label: "Show payment method",
            type: "toggle",
          },
          {
            path: "invoice.showBatch",
            label: "Show batch number",
            type: "toggle",
          },
          {
            path: "invoice.showLooseQuantity",
            label: "Show loose quantity",
            type: "toggle",
          },
          {
            path: "invoice.showMixIngredients",
            label: "Show mix ingredients",
            type: "toggle",
          },
          { path: "invoice.footerLine1", label: "Footer line 1" },
          { path: "invoice.footerLine2", label: "Footer line 2" },
        ],
      },
    ],
  },
  receipt: {
    title: "Thermal Receipt",
    description:
      "Controls the 58mm or 80mm receipt rendering and print behavior.",
    groups: [
      {
        title: "Receipt layout",
        fields: [
          {
            path: "receipt.width",
            label: "Receipt width",
            type: "select",
            options: [
              ["80mm", "80 mm"],
              ["58mm", "58 mm"],
            ],
          },
          {
            path: "receipt.showLogo",
            label: "Show store logo",
            type: "toggle",
          },
          {
            path: "receipt.showAddress",
            label: "Show store address",
            type: "toggle",
          },
          { path: "receipt.showPhone", label: "Show phone", type: "toggle" },
          {
            path: "receipt.showCustomer",
            label: "Show customer",
            type: "toggle",
          },
          {
            path: "receipt.showCashier",
            label: "Show cashier",
            type: "toggle",
          },
          {
            path: "receipt.showPaymentMethod",
            label: "Show payment method",
            type: "toggle",
          },
          {
            path: "receipt.showPaymentBreakdown",
            label: "Show payment breakdown",
            type: "toggle",
          },
          { path: "receipt.showBatch", label: "Show batch", type: "toggle" },
          {
            path: "receipt.showLooseQuantity",
            label: "Show loose quantity",
            type: "toggle",
          },
          {
            path: "receipt.showMixIngredients",
            label: "Show mix ingredients",
            type: "toggle",
          },
          {
            path: "receipt.autoPrint",
            label: "Automatically print after sale",
            type: "toggle",
          },
          { path: "receipt.footerLine1", label: "Footer line 1" },
          { path: "receipt.footerLine2", label: "Footer line 2" },
          {
            path: "receipt.showPoweredBy",
            label: 'Show "Powered by Oushadi POS"',
            type: "toggle",
          },
        ],
      },
    ],
  },
  purchases: {
    title: "Purchases & Expenses",
    description: "Supplier purchasing and expense-entry requirements.",
    groups: [
      {
        title: "Purchases",
        fields: [
          {
            path: "purchases.requireSupplier",
            label: "Require supplier",
            type: "toggle",
          },
          {
            path: "purchases.requireSupplierInvoice",
            label: "Require supplier invoice number",
            type: "toggle",
          },
          {
            path: "purchases.requirePurchaseDate",
            label: "Require purchase date",
            type: "toggle",
          },
          {
            path: "purchases.requireBatchForBatchProducts",
            label: "Require batch for batch products",
            type: "toggle",
          },
          {
            path: "purchases.requireExpiryForMedicines",
            label: "Require expiry for medicines",
            type: "toggle",
          },
          {
            path: "purchases.allowFreePackages",
            label: "Allow free packages",
            type: "toggle",
          },
          {
            path: "purchases.allowAdditionalCharges",
            label: "Allow additional charges",
            type: "toggle",
          },
          {
            path: "purchases.allowDiscount",
            label: "Allow purchase discount",
            type: "toggle",
          },
          {
            path: "purchases.allowPartialPayment",
            label: "Allow partial payment",
            type: "toggle",
          },
          {
            path: "purchases.allowUnpaid",
            label: "Allow unpaid purchase",
            type: "toggle",
          },
          {
            path: "purchases.defaultPaymentMethod",
            label: "Default payment method",
            type: "select",
            options: [
              ["CASH", "Cash"],
              ["UPI", "UPI"],
              ["BANK", "Bank transfer"],
            ],
          },
        ],
      },
      {
        title: "Expenses",
        fields: [
          {
            path: "expenses.requireCategory",
            label: "Require category",
            type: "toggle",
          },
          {
            path: "expenses.requireTitle",
            label: "Require expense title",
            type: "toggle",
          },
          {
            path: "expenses.requirePaymentMethod",
            label: "Require payment method",
            type: "toggle",
          },
          {
            path: "expenses.requirePaymentReference",
            label: "Require payment reference",
            type: "toggle",
          },
          {
            path: "expenses.allowStaffCreation",
            label: "Allow staff expense creation",
            type: "toggle",
          },
          {
            path: "expenses.showPurchaseLinkedExpenses",
            label: "Show purchase-linked expenses",
            type: "toggle",
          },
        ],
      },
    ],
  },
  customers: {
    title: "Customers",
    description: "Registration requirements and normalized duplicate checking.",
    groups: [
      {
        title: "Customer rules",
        fields: [
          {
            path: "customers.defaultWalkIn",
            label: "Default Walk-in Customer",
            type: "toggle",
          },
          {
            path: "customers.requireName",
            label: "Require name for new customer",
            type: "toggle",
          },
          {
            path: "customers.requirePhone",
            label: "Require phone",
            type: "toggle",
          },
          {
            path: "customers.requireEmail",
            label: "Require email",
            type: "toggle",
          },
          {
            path: "customers.requireAddress",
            label: "Require address",
            type: "toggle",
          },
          {
            path: "customers.duplicatePhoneCheck",
            label: "Check duplicate phone",
            type: "toggle",
          },
          {
            path: "customers.duplicateEmailCheck",
            label: "Check duplicate email",
            type: "toggle",
          },
        ],
      },
    ],
  },
  notifications: {
    title: "Notifications",
    description:
      "In-app operational warnings only; no unsupported email or SMS automation.",
    groups: [
      {
        title: "In-app alerts",
        fields: [
          {
            path: "notifications.lowStock",
            label: "Low stock alerts",
            type: "toggle",
          },
          {
            path: "notifications.expiry",
            label: "Expiry alerts",
            type: "toggle",
          },
          {
            path: "notifications.expired",
            label: "Expired product alerts",
            type: "toggle",
          },
          {
            path: "notifications.purchaseDue",
            label: "Purchase due alerts",
            type: "toggle",
          },
          {
            path: "notifications.stockAdjustment",
            label: "Stock adjustment alerts",
            type: "toggle",
          },
        ],
      },
    ],
  },
  security: {
    title: "Security",
    description:
      "Staff password strength and inactive-session behavior. Secrets are never exposed.",
    groups: [
      {
        title: "Password rules",
        fields: [
          {
            path: "security.minimumPasswordLength",
            label: "Minimum password length",
            type: "number",
          },
          {
            path: "security.requireUppercase",
            label: "Require uppercase",
            type: "toggle",
          },
          {
            path: "security.requireLowercase",
            label: "Require lowercase",
            type: "toggle",
          },
          {
            path: "security.requireNumber",
            label: "Require number",
            type: "toggle",
          },
          {
            path: "security.requireSpecialCharacter",
            label: "Require special character",
            type: "toggle",
          },
        ],
      },
      {
        title: "Session",
        fields: [
          {
            path: "security.sessionTimeoutMinutes",
            label: "Session timeout",
            type: "select",
            options: [
              [30, "30 Minutes"],
              [60, "1 Hour"],
              [240, "4 Hours"],
              [480, "8 Hours"],
              [720, "12 Hours"],
            ],
          },
          {
            path: "security.logoutInactiveStaff",
            label: "Logout inactive staff automatically",
            type: "toggle",
          },
        ],
      },
    ],
  },
  backup: {
    title: "Backups",
    description:
      "Create encrypted database archives manually or on a recurring schedule.",
  },
};

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="settings-toggle"
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}
function ReasonList({ value = [], onChange, disabled }) {
  const [draft, setDraft] = useState("");
  function add() {
    const name = draft.trim();
    if (
      !name ||
      value.some((item) => item.name.toLowerCase() === name.toLowerCase())
    )
      return;
    onChange([...value, { name, active: true, requireApproval: false }]);
    setDraft("");
  }
  return (
    <div className="sm:col-span-2">
      <div className="space-y-2">
        {value.map((reason, index) => (
          <div
            className="grid items-center gap-3 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-[1fr_auto_auto_auto]"
            key={`${reason.name}-${index}`}
          >
            <strong>{reason.name}</strong>
            <label className="flex items-center gap-2 text-xs font-bold">
              <Toggle
                checked={reason.active !== false}
                disabled={disabled}
                onChange={(active) =>
                  onChange(
                    value.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, active } : item,
                    ),
                  )
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              <Toggle
                checked={Boolean(reason.requireApproval)}
                disabled={disabled}
                onChange={(requireApproval) =>
                  onChange(
                    value.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, requireApproval } : item,
                    ),
                  )
                }
              />
              Approval
            </label>
            <button
              type="button"
              disabled={disabled}
              className="grid size-9 place-items-center rounded-lg text-[var(--red)] hover:bg-red-50"
              onClick={() =>
                onChange(value.filter((_, itemIndex) => itemIndex !== index))
              }
              aria-label={`Remove ${reason.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="field"
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add discount reason"
        />
        <button
          type="button"
          className="btn shrink-0"
          disabled={disabled || !draft.trim()}
          onClick={add}
        >
          <Plus size={16} />
          Add Reason
        </button>
      </div>
    </div>
  );
}
function PricingPreview({ data }) {
  const configuredPercentage = Math.min(
      Number(data.discount?.maxPercentage || 10),
      10,
    ),
    result = calculateSalePricing({
      items: [
        {
          amount: 1000,
          gstRate: Number(data.gst?.defaultRate || 5),
          taxable: true,
        },
      ],
      discount: {
        type: "PERCENTAGE",
        value: configuredPercentage,
        reason:
          data.discount?.reasons?.find((item) => item.active !== false)?.name ||
          "Preview",
      },
      settings: data,
      currentUser: { role: "ADMIN" },
      paymentMethod: "CASH",
      placeOfSupply: data.store?.stateCode,
    });
  const rows = [
    ["Subtotal", result.subtotal],
    ["Discount", -result.totalDiscount],
    ["Taxable Amount", result.gst.taxableSubtotal],
    ["GST", result.gst.tax],
    ["Round Off", result.roundOff],
    ["Grand Total", result.total],
  ];
  return (
    <div className="pricing-preview sm:col-span-2">
      <p className="mb-4 text-xs text-[var(--muted)]">
        Sample only. No sale or stock record is created.
      </p>
      {rows.map(([label, value], index) => (
        <div
          className={`flex items-center justify-between py-2 ${index === rows.length - 1 ? "mt-2 border-t-2 border-[var(--ink)] pt-4 text-lg" : "border-b border-dashed border-[var(--line)]"}`}
          key={label}
        >
          <span>{label}</span>
          <strong>
            {new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
            }).format(value)}
          </strong>
        </div>
      ))}
    </div>
  );
}
function Field({ field, data, change, error, disabled }) {
  if (field.when && !get(data, field.when)) return null;
  if (field.whenValue && get(data, field.whenValue[0]) !== field.whenValue[1])
    return null;
  const value = get(data, field.path),
    controlDisabled =
      disabled ||
      (field.requiresGst && !data.gst?.enabled) ||
      (field.requiresDiscount && !data.discount?.enabled) ||
      (field.requiresRoundOff && !data.roundOff?.enabled);
  if (field.type === "pricingPreview") return <PricingPreview data={data} />;
  if (field.type === "reasonList")
    return (
      <ReasonList
        value={value}
        disabled={controlDisabled}
        onChange={(next) => change(field.path, next)}
      />
    );
  if (field.type === "toggle")
    return (
      <div
        className={`flex items-center justify-between gap-5 border-b border-[var(--line)] py-3 last:border-0 ${controlDisabled ? "opacity-55" : ""}`}
      >
        <div>
          <p className="font-bold">{field.label}</p>
          {field.note && (
            <p className="mt-1 text-xs text-[var(--muted)]">{field.note}</p>
          )}
        </div>
        <Toggle
          checked={Boolean(value)}
          disabled={controlDisabled}
          onChange={(next) => change(field.path, next)}
        />
      </div>
    );
  if (field.type === "readonly")
    return (
      <div
        className={`rounded-xl bg-[#f3f6f1] p-3 ${controlDisabled ? "opacity-50" : ""}`}
      >
        <span className="label">{field.label}</span>
        <strong className="text-lg">{value || "—"}</strong>
        {field.note && (
          <p className="mt-1 text-xs text-[var(--muted)]">{field.note}</p>
        )}
      </div>
    );
  if (field.type === "stateSummary") {
    const state = GST_STATES.find(([code]) => code === String(value));
    return (
      <div
        className={`rounded-xl bg-[var(--green-soft)] p-3 text-sm ${controlDisabled ? "opacity-50" : ""}`}
      >
        <span className="label">{field.label}</span>
        <strong>
          {state?.[1] || "Not selected"} ({value || "—"})
        </strong>
      </div>
    );
  }
  if (field.type === "radioCards")
    return (
      <fieldset className="sm:col-span-2" disabled={controlDisabled}>
        <legend className="sr-only">{field.label}</legend>
        <div
          className={`grid gap-3 ${field.options.length === 2 ? "sm:grid-cols-2" : field.options.length === 3 ? "sm:grid-cols-3" : ""}`}
        >
          {field.options.map(([option, label, description, badge]) => (
            <button
              type="button"
              disabled={controlDisabled}
              onClick={() => change(field.path, option)}
              className={`rounded-xl border p-4 text-left transition ${value === option ? "border-[var(--green)] bg-[var(--green-soft)] shadow-sm" : "border-[var(--line)] bg-white hover:border-emerald-300"} disabled:cursor-not-allowed disabled:opacity-50`}
              key={option}
            >
              <span className="flex items-center justify-between gap-2">
                <strong>{label}</strong>
                {badge && (
                  <small className="rounded-full bg-white px-2 py-1 font-extrabold text-[var(--green)]">
                    {badge}
                  </small>
                )}
              </span>
              {description && (
                <small className="mt-1 block text-[var(--muted)]">
                  {description}
                </small>
              )}
            </button>
          ))}
        </div>
      </fieldset>
    );
  return (
    <label className={`block ${controlDisabled ? "opacity-55" : ""}`}>
      <span className="label">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <div className="flex items-center gap-2">
        {field.prefix && (
          <span className="font-bold text-[var(--muted)]">{field.prefix}</span>
        )}
        {field.type === "select" ? (
          <select
            className={`field ${error ? "border-red-400" : ""}`}
            disabled={controlDisabled}
            value={value}
            onChange={(event) =>
              change(
                field.path,
                typeof field.options[0][0] === "number"
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
          >
            {field.options.map(([option, label]) => (
              <option value={option} key={option}>
                {label}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            className={`field min-h-24 ${error ? "border-red-400" : ""}`}
            disabled={controlDisabled}
            value={value || ""}
            onChange={(event) => change(field.path, event.target.value)}
          />
        ) : (
          <input
            className={`field ${error ? "border-red-400" : ""}`}
            disabled={controlDisabled}
            type={
              field.type === "number"
                ? "number"
                : field.type === "email"
                  ? "email"
                  : "text"
            }
            value={
              field.type === "numberList"
                ? (value || []).join(", ")
                : (value ?? "")
            }
            onChange={(event) =>
              change(
                field.path,
                field.type === "number"
                  ? Number(event.target.value)
                  : field.type === "numberList"
                    ? event.target.value
                        .split(",")
                        .map((item) => Number(item.trim()))
                        .filter((item) => item > 0)
                    : event.target.value,
              )
            }
          />
        )}{" "}
        {field.suffix && (
          <span className="whitespace-nowrap text-sm font-bold text-[var(--muted)]">
            {field.suffix}
          </span>
        )}
      </div>
      {field.note && (
        <p className="mt-1 text-xs text-[var(--muted)]">{field.note}</p>
      )}
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
    </label>
  );
}

function Payments({ data, change, errors, disabled }) {
  const methods = [
      { id: "CASH", label: "Cash" },
      { id: "UPI", label: "UPI" },
      { id: "BANK", label: "Bank Transfer" },
    ],
    enabled = data.payments.enabledMethods || [];
  function toggle(method, next) {
    let list = next
      ? [...enabled, method]
      : enabled.filter((item) => item !== method);
    if (!list.length)
      return toast.error("At least one payment method must remain enabled.");
    change("payments.enabledMethods", [...new Set(list)]);
  }
  return (
    <>
      <Card
        title="Payment methods"
        description="Disabled methods disappear from checkout, purchases and expenses."
      >
        {methods.map((method) => (
          <div
            className="flex items-center justify-between border-b border-[var(--line)] py-4 last:border-0"
            key={method.id}
          >
            <strong>{method.label}</strong>
            <Toggle
              checked={enabled.includes(method.id)}
              disabled={disabled}
              onChange={(next) => toggle(method.id, next)}
            />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-[var(--line)] py-4">
          <div>
            <strong>Split Payment</strong>
            <p className="text-xs text-[var(--muted)]">
              Enabled payment components must equal the invoice total.
            </p>
          </div>
          <Toggle
            checked={data.payments.splitPayment}
            disabled={disabled}
            onChange={(next) => change("payments.splitPayment", next)}
          />
        </div>
      </Card>
      {enabled.includes("CASH") && (
        <Card title="Cash">
          <Field
            field={{
              path: "payments.cash.requireReceivedAmount",
              label: "Require cash received",
              type: "toggle",
            }}
            data={data}
            change={change}
            disabled={disabled}
          />
          <Field
            field={{
              path: "payments.cash.showChange",
              label: "Show change calculation",
              type: "toggle",
            }}
            data={data}
            change={change}
            disabled={disabled}
          />
        </Card>
      )}
      {enabled.includes("UPI") && (
        <Card title="UPI">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              field={{
                path: "payments.upi.displayName",
                label: "UPI display name",
              }}
              data={data}
              change={change}
              disabled={disabled}
            />
            <Field
              field={{ path: "payments.upi.upiId", label: "UPI ID" }}
              data={data}
              change={change}
              disabled={disabled}
            />
          </div>
          <Field
            field={{
              path: "payments.upi.requireReference",
              label: "Require payment reference",
              type: "toggle",
            }}
            data={data}
            change={change}
            disabled={disabled}
          />
        </Card>
      )}
      {enabled.includes("BANK") && (
        <Card title="Bank Transfer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              field={{ path: "payments.bank.bankName", label: "Bank name" }}
              data={data}
              change={change}
              disabled={disabled}
            />
            <Field
              field={{
                path: "payments.bank.accountName",
                label: "Account name",
              }}
              data={data}
              change={change}
              disabled={disabled}
            />
            <Field
              field={{
                path: "payments.bank.accountNumber",
                label: "Account number",
              }}
              data={data}
              change={change}
              disabled={disabled}
            />
            <Field
              field={{ path: "payments.bank.ifsc", label: "IFSC" }}
              data={data}
              change={change}
              disabled={disabled}
            />
          </div>
          <Field
            field={{
              path: "payments.bank.requireReference",
              label: "Require transaction reference",
              type: "toggle",
            }}
            data={data}
            change={change}
            disabled={disabled}
          />
        </Card>
      )}
    </>
  );
}
function Card({ title, description, children }) {
  const gstIcons = {
      "GST Registration": Building2,
      "GST Calculation Method": CircleDollarSign,
      "Price Treatment": WalletCards,
      "Product Tax Defaults": PackageOpen,
      "GST Display": ShoppingCart,
      "Tax Determination": ShieldCheck,
    },
    discountIcons = {
      "Discount Availability": CircleDollarSign,
      "Discount Types & Limits": SlidersHorizontal,
      "Discount Scope": ShoppingCart,
      "Discount Permissions & Approval": ShieldCheck,
      "Discount Rules": Settings2,
      "Discount Reasons": FileText,
      "Automatic Discount Behaviour": CircleDollarSign,
      "Round Off": WalletCards,
      "Calculation Order": SlidersHorizontal,
      "Calculation Preview": CircleDollarSign,
    },
    Icon = gstIcons[title] || discountIcons[title],
    specialClass = gstIcons[title]
      ? "gst-settings-card"
      : discountIcons[title]
        ? "discount-settings-card"
        : "";
  return (
    <section className={`card p-5 sm:p-6 ${specialClass}`}>
      {Icon ? (
        <div className="gst-card-heading">
          <span className="gst-card-icon">
            <Icon size={18} />
          </span>
          <div>
            <h3 className="text-lg font-extrabold">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-extrabold">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          )}
        </>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
function Audit() {
  const [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/api/settings/audit?page=${page}&limit=25`)
      .then((result) => active && setData(result))
      .catch((failure) => active && setError(failure.message));
    return () => {
      active = false;
    };
  }, [page]);
  if (error)
    return (
      <Card title="Unable to load Settings audit">
        <p className="text-sm text-[var(--muted)]">{error}</p>
      </Card>
    );
  if (!data)
    return (
      <Card title="Audit log">
        <LoaderCircle className="loading-shimmer-icon" />
      </Card>
    );
  return (
    <Card
      title="Audit log"
      description="Security and business configuration changes are retained for accountability."
    >
      {data.rows.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Staff</th>
                  <th>Section</th>
                  <th>Setting</th>
                  <th>Old value</th>
                  <th>New value</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(row.date))}
                    </td>
                    <td className="font-bold">{row.staff}</td>
                    <td>{row.section}</td>
                    <td>{row.setting}</td>
                    <td className="max-w-52 truncate text-[var(--muted)]">
                      {row.oldValue}
                    </td>
                    <td className="max-w-52 truncate">{row.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              className="btn"
              disabled={page >= data.pagination.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No Settings changes have been recorded yet.
        </p>
      )}
    </Card>
  );
}

function RestoreBackup() {
  const [file, setFile] = useState(null),
    [confirmation, setConfirmation] = useState(""),
    [restoring, setRestoring] = useState(false);
  async function restore() {
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("archive", file);
      form.append("confirmation", confirmation);
      const result = await api("/api/backups/restore", {
        method: "POST",
        body: form,
      });
      toast.success(`Database restored. Safety backup: ${result.safetyBackup}`);
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRestoring(false);
    }
  }
  return (
    <Card
      title="Restore database"
      description="Replace the live database with a previously downloaded Oushadi backup."
    >
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
        <strong>
          This replaces current users, inventory, customers, sales, purchases,
          expenses, settings, and audit history.
        </strong>
        <p className="mt-1">
          The system creates a safety backup of the current database before
          restoration. Do not close the server while restore is running.
        </p>
      </div>
      <label className="block">
        <span className="label">Backup archive *</span>
        <input
          className="field file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-bold file:text-[var(--green)]"
          type="file"
          accept=".obak,application/octet-stream"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      </label>
      <label className="block">
        <span className="label">Type RESTORE DATABASE to confirm</span>
        <input
          className="field"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="RESTORE DATABASE"
          autoComplete="off"
        />
      </label>
      <button
        className="btn btn-danger"
        disabled={!file || confirmation !== "RESTORE DATABASE" || restoring}
        onClick={restore}
      >
        {restoring ? (
          <>
            <LoaderCircle className="loading-shimmer-icon" size={17} />
            Restoring…
          </>
        ) : (
          <>
            <Upload size={17} />
            Restore database
          </>
        )}
      </button>
    </Card>
  );
}
const backupDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not yet";
const backupSize = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
function Backup({ data, change, disabled }) {
  const [status, setStatus] = useState(null),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [failure, setFailure] = useState("");
  async function load() {
    setLoading(true);
    try {
      setStatus(await api("/api/backups"));
      setFailure("");
    } catch (error) {
      setFailure(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  async function create() {
    setCreating(true);
    try {
      const backup = await api("/api/backups", { method: "POST" });
      const link = document.createElement("a");
      link.href = `/api/backups/${encodeURIComponent(backup.name)}`;
      link.download = backup.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Encrypted backup created and downloaded.");
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  }
  if (failure)
    return (
      <Card title="Unable to load backups">
        <p className="text-sm text-[var(--muted)]">{failure}</p>
        <button className="btn" onClick={load}>
          <RefreshCw size={16} />
          Retry
        </button>
      </Card>
    );
  if (loading && !status)
    return (
      <Card title="Backup status">
        <LoaderCircle className="loading-shimmer-icon" />
      </Card>
    );
  return (
    <div className="space-y-5">
      <Card
        title="Automatic backup"
        description={
          status?.storage === "mongodb"
            ? "Due backups are checked when backup status is requested. Keep a downloaded copy outside this database for independent recovery."
            : "The server checks every 15 minutes and creates a due encrypted archive while the POS server is running."
        }
      >
        <div className="flex items-center justify-between gap-5 border-b border-[var(--line)] pb-4">
          <div>
            <p className="font-bold">Enable automatic backup</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Save Settings after changing this option.
            </p>
          </div>
          <Toggle
            checked={Boolean(data.backup?.automaticEnabled)}
            disabled={disabled || !status?.configured}
            onChange={(value) => change("backup.automaticEnabled", value)}
          />
        </div>
        <Field
          field={{
            path: "backup.frequency",
            label: "Backup frequency",
            type: "select",
            options: [
              ["DAILY", "Daily"],
              ["WEEKLY", "Weekly"],
              ["MONTHLY", "Monthly"],
            ],
          }}
          data={data}
          change={change}
          disabled={disabled || !status?.configured}
        />
        {!status?.configured && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
            Backup encryption is unavailable. Configure BACKUP_ENCRYPTION_KEY on
            the server.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="label">Last automatic backup</span>
            <strong className="block">
              {backupDate(status?.lastAutomaticBackup?.createdAt)}
            </strong>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="label">
              Next {String(data.backup?.frequency || "daily").toLowerCase()}{" "}
              backup
            </span>
            <strong className="block">
              {data.backup?.automaticEnabled
                ? backupDate(status?.nextAutomaticAt)
                : "Automatic backup is off"}
            </strong>
          </div>
        </div>
      </Card>
      <Card
        title="Manual backup"
        description="Create a complete encrypted snapshot and download a copy to this device."
      >
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <HardDrive className="mt-0.5 text-[var(--green)]" />
            <div>
              <strong>Back up database now</strong>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                Includes users, products, inventory, customers, transactions,
                settings, and audit records.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary shrink-0"
            disabled={creating || !status?.configured}
            onClick={create}
          >
            {creating ? (
              <>
                <LoaderCircle className="loading-shimmer-icon" size={17} />
                Creating…
              </>
            ) : (
              <>
                <Download size={17} />
                Create & download
              </>
            )}
          </button>
        </div>
        <div>
          <span className="label">Archive storage</span>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">
            {status?.directory}
          </code>
        </div>
        {status?.keySource === "JWT_SECRET" && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Archives are encrypted with JWT_SECRET. Configure a separate
            BACKUP_ENCRYPTION_KEY for independent key rotation.
          </p>
        )}
      </Card>
      <Card
        title="Backup history"
        description="Existing archives are kept until you manage them outside the application."
      >
        {status?.backups?.length ? (
          <div className="divide-y divide-[var(--line)]">
            {status.backups.slice(0, 20).map((backup) => (
              <div
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                key={backup.name}
              >
                <div>
                  <strong>
                    {backup.type === "AUTOMATIC" ? "Automatic" : "Manual"}{" "}
                    backup
                  </strong>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {backupDate(backup.createdAt)} · {backupSize(backup.size)}
                  </p>
                </div>
                <a
                  className="btn"
                  href={`/api/backups/${encodeURIComponent(backup.name)}`}
                  download
                >
                  <Download size={16} />
                  Download
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            No backups have been created yet.
          </p>
        )}
      </Card>
      <RestoreBackup />
    </div>
  );
}

export default function SettingsWorkspace() {
  const [data, setData] = useState(null),
    [original, setOriginal] = useState(null),
    [section, setSection] = useState("store"),
    [search, setSearch] = useState(""),
    [errors, setErrors] = useState({}),
    [saving, setSaving] = useState(false),
    [loadError, setLoadError] = useState(""),
    [confirmReset, setConfirmReset] = useState("");
  async function load() {
    try {
      const result = await api("/api/settings");
      setData(result);
      setOriginal(result);
      setLoadError("");
    } catch (failure) {
      setLoadError(failure.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const dirty = useMemo(
    () => data && original && JSON.stringify(data) !== JSON.stringify(original),
    [data, original],
  );
  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const available = sections.filter((item) =>
    `${item.label} ${item.keywords}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function change(path, value) {
    setData((current) => set(current, path, value));
    setErrors((current) => ({ ...current, [path]: undefined }));
  }
  async function save() {
    setSaving(true);
    try {
      const result = await api("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      result._capabilities = data._capabilities;
      setData(result);
      setOriginal(result);
      setErrors({});
      toast.success("Settings saved successfully.");
    } catch (failure) {
      setErrors(failure.details || {});
      toast.error(failure.message);
    } finally {
      setSaving(false);
    }
  }
  async function resetAll() {
    try {
      const result = await api("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmReset }),
      });
      result._capabilities = data._capabilities;
      setData(result);
      setOriginal(result);
      setConfirmReset("");
      toast.success("Settings reset to defaults.");
    } catch (failure) {
      toast.error(failure.message);
    }
  }
  if (loadError)
    return (
      <div className="card grid min-h-72 place-items-center p-8 text-center">
        <div>
          <LockKeyhole className="mx-auto text-[var(--red)]" />
          <h2 className="mt-4 font-extrabold">Unable to load Settings</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{loadError}</p>
          <button className="btn mt-4" onClick={load}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        <div className="card h-96 loading-shimmer bg-slate-100" />
        <div className="space-y-4">
          <div className="card h-36 loading-shimmer bg-slate-100" />
          <div className="card h-72 loading-shimmer bg-slate-100" />
        </div>
      </div>
    );
  const current = configs[section],
    canEdit = data._capabilities?.edit;
  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Administration
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Configure your store, checkout, inventory, payments, receipts and
            system behavior.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <span className="mr-2 text-sm font-extrabold text-amber-700">
              ● Unsaved changes
            </span>
          )}
          <button
            className="btn"
            disabled={!dirty || saving}
            onClick={() => {
              setData(structuredClone(original));
              setErrors({});
              toast.success("Unsaved changes discarded.");
            }}
          >
            Discard
          </button>
          {canEdit && (
            <button
              className="btn btn-primary"
              disabled={!dirty || saving}
              onClick={save}
            >
              {saving ? "Saving settings…" : "Save Changes"}
            </button>
          )}
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="report-controls card h-fit p-3 lg:sticky lg:top-24">
          <div className="relative mb-3">
            <Search
              className="absolute left-3 top-3 text-[var(--muted)]"
              size={17}
            />
            <input
              className="field !pl-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search settings..."
            />
          </div>
          <select
            className="field lg:hidden"
            value={section}
            onChange={(event) => setSection(event.target.value)}
          >
            {available.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="hidden lg:block">
            {sectionGroups.map((group) => {
              const items = group.items.filter((item) =>
                available.includes(item),
              );
              return items.length ? (
                <div className="mb-4" key={group.label}>
                  <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--muted)]">
                    {group.label}
                  </p>
                  {items.map((item) => (
                    <button
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold ${section === item.id ? "bg-[var(--green-soft)] text-[var(--green)]" : "hover:bg-slate-50"}`}
                      onClick={() => setSection(item.id)}
                      key={item.id}
                    >
                      <item.icon size={17} />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        </aside>
        <main className="min-w-0">
          <div className="mb-4">
            <h2 className="text-2xl font-extrabold">
              {current?.title ||
                sections.find((item) => item.id === section)?.label}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {current?.description}
            </p>
            {!canEdit && section !== "audit" && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                You have view-only access to Settings.
              </p>
            )}
          </div>
          {section === "payments" ? (
            <div className="space-y-5">
              <Payments
                data={data}
                change={change}
                errors={errors}
                disabled={!canEdit}
              />
            </div>
          ) : section === "backup" ? (
            data._capabilities?.backup ? (
              <div className="space-y-5">
                <BackupStorageSettings
                  storage={data._capabilities?.backupStorage}
                  value={data.backup?.directory}
                  onChange={(value) => change("backup.directory", value)}
                  disabled={!canEdit}
                  error={errors["backup.directory"]}
                />
                <Backup
                  key={original.backup?.directory || "default"}
                  data={data}
                  change={change}
                  disabled={!canEdit}
                />
              </div>
            ) : (
              <Card title="Backup access">
                <p className="text-sm text-[var(--muted)]">
                  Only the shop owner can manage database backups.
                </p>
              </Card>
            )
          ) : section === "audit" ? (
            <Audit />
          ) : section === "danger" ? (
            <Card
              title="Reset All Settings to Default"
              description="This changes configuration only. Sales, inventory and historical transactions are not deleted."
            >
              {data._capabilities?.reset ? (
                <>
                  <label>
                    <span className="label">
                      Type RESET SETTINGS to confirm
                    </span>
                    <input
                      className="field"
                      value={confirmReset}
                      onChange={(event) => setConfirmReset(event.target.value)}
                    />
                  </label>
                  <button
                    className="btn btn-danger"
                    disabled={confirmReset !== "RESET SETTINGS"}
                    onClick={resetAll}
                  >
                    Reset all settings
                  </button>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Only the shop owner can reset all Settings.
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-5">
              {current.groups.map((group) => (
                <Card title={group.title} key={group.title}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <Field
                        field={field}
                        data={data}
                        change={change}
                        error={errors[field.path]}
                        disabled={!canEdit}
                        key={field.path}
                      />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-[var(--line)] bg-white/95 p-3 backdrop-blur lg:left-[244px] lg:px-8">
        {dirty && (
          <span className="mr-auto text-sm font-extrabold text-amber-700">
            ● Unsaved changes
          </span>
        )}
        <button
          className="btn"
          disabled={!dirty || saving}
          onClick={() => setData(structuredClone(original))}
        >
          Discard
        </button>
        {canEdit && (
          <button
            className="btn btn-primary"
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check size={17} />
                Save Changes
              </>
            )}
          </button>
        )}
      </div>
      <div className="h-20" data-settings-spacer />
    </>
  );
}
