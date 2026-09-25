"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { calculateSalePricing } from "@/services/pricing.service";
import { GST_STATES } from "@/lib/gst-states";
import { isWholesaleCustomer } from "@/lib/sale-customer";
import {checkoutFetch} from "@/lib/checkout-request";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const amount = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const lineTotal = (item) =>
  item.kind === "MIX"
    ? Number(item.packageSellingPrice || 0)
    : item.saleMode === "WHOLESALE"
      ? Number(item.wholesaleTotal || 0)
      : item.saleMode === "LOOSE"
        ? Number(item.looseQuantity || 0) * Number(item.loosePricePerUnit || 0)
        : Number(item.quantity || 0) * Number(item.packageSellingPrice || 0);
async function api(url, options) {
  const response = await checkoutFetch(url, options);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error);
  return json.data;
}

export default function SalesCheckoutHostV2() {
  const [cart, setCart] = useState([]),
    [open, setOpen] = useState(false),
    [customerType, setCustomerType] = useState("WALK_IN"),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false),
    [duplicate, setDuplicate] = useState(null),
    [discountType, setDiscountType] = useState("FIXED"),
    [discountValue, setDiscountValue] = useState(""),
    [payment, setPayment] = useState("CASH"),
    [cashReceived, setCashReceived] = useState(""),
    [splitCash, setSplitCash] = useState(""),
    [splitUpi, setSplitUpi] = useState(""),
    [newCreditLimit, setNewCreditLimit] = useState("0"),
    [reference, setReference] = useState(""),
    [saving, setSaving] = useState(false),
    [settings, setSettings] = useState(null);
  const [saleType, setSaleType] = useState("SALE");
  const [newGstin,setNewGstin]=useState("");
  const [fulfilment,setFulfilment]=useState("COUNTER"),[deliveryAddress,setDeliveryAddress]=useState(""),[deliveryStateCode,setDeliveryStateCode]=useState(""),[recipientStateCode,setRecipientStateCode]=useState(""),[discountReason,setDiscountReason]=useState("");
  const placeOfSupply=fulfilment==="DELIVERY"?(deliveryStateCode||settings?.store?.stateCode):customerType==="NEW"&&!newGstin?(recipientStateCode||settings?.store?.stateCode):selected&&!selected.gstin?(selected.stateCode||settings?.store?.stateCode):settings?.store?.stateCode||"";
  useEffect(() => {
    const handle = (event) => {
      const checkoutCart = event.detail?.cart || [];
      if (event.detail?.source !== "PROCEED_PAYMENT" || !checkoutCart.length)
        return;
      let preselected = null;
      try {
        const saved = sessionStorage.getItem("oushadi-preselected-customer");
        if (saved) preselected = JSON.parse(saved);
      } catch {}
      const nextSaleType =
        event.detail?.saleType === "WHOLESALE" ? "WHOLESALE" : "SALE";
      if (nextSaleType === "WHOLESALE" || isWholesaleCustomer(preselected))
        preselected = null;
      const customerDiscount =
        nextSaleType === "WHOLESALE"
          ? Number(preselected?.defaultDiscount || 0)
          : 0;
      setFulfilment("COUNTER");setDeliveryAddress("");setDeliveryStateCode("");setRecipientStateCode("");setDiscountReason("");
      setSaleType(nextSaleType);
      setCart(checkoutCart);
      setCustomerType(
        preselected
          ? "EXISTING"
          : nextSaleType === "WHOLESALE"
            ? "EXISTING"
            : "WALK_IN",
      );
      setSelected(preselected);
      setQuery("");
      setResults([]);
      setDiscountValue(customerDiscount > 0 ? String(customerDiscount) : "");
      setPayment("CASH");
      setCashReceived("");
      setSplitCash("");
      setSplitUpi("");
      setNewCreditLimit("0");
      setReference("");
      setDuplicate(null);
      setOpen(true);
      api("/api/settings")
        .then((value) => {
          setSettings(value);
          setDiscountType(
            customerDiscount > 0
              ? "PERCENTAGE"
              : value?.discount?.allowFixed === false &&
                  value?.discount?.allowPercentage !== false
                ? "PERCENTAGE"
                : "FIXED",
          );
        })
        .catch(() => {});
    };
    window.addEventListener("oushadi-open-checkout", handle);
    return () => window.removeEventListener("oushadi-open-checkout", handle);
  }, []);
  useEffect(() => {
    if (customerType !== "EXISTING" || query.trim().length < 2) {
      queueMicrotask(() => {
        setResults([]);
        setSearched(false);
        setSearching(false);
      });
      return;
    }
    const controller = new AbortController(),
      timer = setTimeout(async () => {
        setSearching(true);
        try {
          const customerFilter =
            saleType === "WHOLESALE"
              ? "&customerType=WHOLESALE"
              : "&customerType=RETAIL";
          const found = await api(
            `/api/customers/search?q=${encodeURIComponent(query.trim())}${customerFilter}`,
            { signal: controller.signal },
          );
          setResults(found);
          setSearched(true);
        } catch (error) {
          if (error.name !== "AbortError") toast.error(error.message);
        } finally {
          setSearching(false);
        }
      }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerType, query, saleType]);
  const subtotal = useMemo(
    () => amount(cart.reduce((sum, item) => sum + lineTotal(item), 0)),
    [cart],
  );
  const discountEnabled =
      settings?.discount?.enabled && settings.discount.cartLevel !== false,
    enteredDiscount = Math.max(0, Number(discountValue) || 0),
    discountLimit =
      discountType === "PERCENTAGE"
        ? Number(settings?.discount?.maxStaffPercentage)
        : Number(settings?.discount?.maxFixedAmount),
    discountValid =
      !discountEnabled ||
      !Number.isFinite(discountLimit) ||
      enteredDiscount <= discountLimit;
  const pricing=calculateSalePricing({
    items:cart.map(item=>({...item,amount:lineTotal(item),gstRate:item.kind==="MIX"?settings?.gst?.defaultRate:item.gstRate,useDefaultGstRate:item.kind==="MIX"?true:item.useDefaultGstRate})),
    discount:{type:discountType,value:discountEnabled&&discountValid?enteredDiscount:0,reason:discountReason},
    settings,currentUser:{role:settings?._capabilities?.role||"STAFF"},paymentMethod:payment,placeOfSupply
  });
  const discount=pricing.totalDiscount,gstInvoice=pricing.gst,total=pricing.total,roundOff=pricing.roundOff,
    change = amount(Number(cashReceived || 0) - total),
    splitRemaining = amount(
      total - Number(splitCash || 0) - Number(splitUpi || 0),
    ),
    showCheckoutGst =
      settings?.gst?.enabled && settings.gst.showInCheckout !== false,
    detailedGst =
      showCheckoutGst &&
      settings?.gst?.showDetailedBreakdown !== false &&
      settings?.gst?.displayStyle !== "COMPACT";
  const creditLimit = amount(
      customerType === "EXISTING"
        ? selected?.creditLimit
        : customerType === "NEW"
          ? newCreditLimit
          : 0,
    ),
    outstandingAmount = amount(
      customerType === "EXISTING" ? selected?.outstandingAmount : 0,
    ),
    availableCredit = amount(
      Math.max(0, creditLimit - outstandingAmount),
    ),
    creditValid =
      saleType === "WHOLESALE" &&
      customerType !== "WALK_IN" &&
      (customerType !== "EXISTING" || Boolean(selected)) &&
      creditLimit > 0 &&
      total > 0 &&
      total <= availableCredit;
  const paymentValid =
    discountValid &&
    (payment === "CASH"
      ? Number(cashReceived) >= total
      : payment === "UPI"
        ? true
        : payment === "CREDIT"
          ? creditValid
        : Math.abs(splitRemaining) < 0.01 &&
          Number(splitCash) >= 0 &&
          Number(splitUpi) >= 0);
  async function findDuplicate(form) {
    const phone = String(form.phone || "").trim(),
      email = String(form.email || "")
        .trim()
        .toLowerCase();
    for (const value of [phone, email]) {
      if (value.length < 2) continue;
      const matches = await api(
        `/api/customers/search?q=${encodeURIComponent(value)}`,
      );
      const match = matches.find(
        (customer) =>
          (phone && customer.phone === phone) ||
          (email && customer.email === email),
      );
      if (match) return match;
    }
    return null;
  }
  async function complete(event) {
    event.preventDefault();
    if (customerType === "EXISTING" && !selected)
      return toast.error("Select an existing customer");
    if (saleType !== "WHOLESALE" && isWholesaleCustomer(selected)) {
      setSelected(null);
      return toast.error("Select a retail customer for this sale.");
    }
    if (!paymentValid)
      return toast.error(
        payment === "CASH"
          ? "Cash received cannot be less than the total"
          : payment === "CREDIT"
            ? creditLimit <= 0
              ? "Set a customer credit limit before using credit"
              : `Credit limit exceeded. Available credit is ${money(availableCredit)}`
          : "Split payment must equal the total",
      );
    if (
      saleType === "WHOLESALE" &&
      customerType === "EXISTING" &&
      !isWholesaleCustomer(selected)
    ) {
      setSelected(null);
      return toast.error(
        "Select a wholesale customer. This customer is configured as retail.",
      );
    }
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if(pricing.validationErrors.length)return toast.error(pricing.validationErrors[0]);
    if(fulfilment==="DELIVERY"&&(!deliveryAddress.trim()||!deliveryStateCode))return toast.error("Enter delivery address and state");
    if (customerType === "NEW") {
      const match = await findDuplicate(form);
      if (match) {
        setDuplicate(match);
        return;
      }
    }
    const items = cart.map((item) =>
      item.kind === "MIX"
        ? {
            kind: "MIX",
            name: item.name,
            packageType: item.packageType,
            packagingPrice: item.packagingPrice,
            ingredients: item.ingredients.map((ingredient) => ({
              productId: ingredient._id,
              baseQuantity: ingredient.baseQuantity,
            })),
          }
        : item.saleMode === "WHOLESALE"
          ? {
              kind: "PRODUCT",
              productId: item.productId,
              saleMode: "WHOLESALE",
              sellBy: item.sellBy,
              quantity: item.quantity,
              manualFreeQuantity: item.manualFreeQuantity,
              manualFreeReason: item.manualFreeReason,
            }
          : {
              kind: "PRODUCT",
              productId: item.productId || String(item._id).split("-")[0],
              saleMode: item.saleMode,
              quantity: item.quantity,
              baseQuantity: item.looseQuantity,
              openPackageCounts: item.openPackageCounts,
            },
    );
    const payments =
      payment === "CREDIT"
        ? []
        : payment === "SPLIT"
        ? [
            { method: "CASH", amount: Number(splitCash) },
            { method: "UPI", amount: Number(splitUpi), reference },
          ]
        : [
            {
              method: payment,
              amount: total,
              reference: payment === "UPI" ? reference : "",
            },
          ];
    const newCustomer =
      customerType === "NEW"
        ? saleType === "WHOLESALE"
          ? {
              name: form.customerName,
              phone: form.phone,
              email: form.email,
              address: form.billingAddress,
              customerType: "WHOLESALE",
              businessName: form.businessName,
              gstin: form.gstin,
              stateCode:recipientStateCode,
              billingAddress: form.billingAddress,
              shippingAddress: form.shippingAddress,
              creditLimit: form.creditLimit,
              defaultDiscount: form.defaultDiscount,
              notes: form.notes,
            }
          : {
              name: form.customerName,
              phone: form.phone,
              email: form.email,
              address: form.address,
              customerType: "RETAIL",
              gstin:form.retailGstin,stateCode:recipientStateCode,
            }
        : undefined;
    setSaving(true);
    try {
      const completed = await api("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          saleType,
          customerType,
          customerId: selected?._id,
          customer: newCustomer,
          doctorName: form.doctorName,
          discountType,
          discountValue: enteredDiscount,
          supplyContext:{fulfilment,deliveryAddress,deliveryStateCode},
          discountReason,
          payments,
          credit: payment === "CREDIT",
        }),
      });
      sessionStorage.removeItem("oushadi-preselected-customer");
      setOpen(false);
      window.dispatchEvent(new CustomEvent("oushadi-sale-complete"));
      window.dispatchEvent(
        new CustomEvent("oushadi-sale-success", {
          detail: { sale: completed },
        }),
      );
      toast.success(
        `${saleType === "WHOLESALE" ? "Wholesale sale" : "Sale"} ${completed.invoiceNumber} completed`,
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  function chooseType(type) {
    if (saleType === "WHOLESALE" && type === "WALK_IN")
      return toast.error("Wholesale sales require a wholesale customer");
    setCustomerType(type);
    setSelected(null);
    setDuplicate(null);
    setQuery("");
    setResults([]);
  }
  function chooseExisting(customer) {
    if (saleType !== "WHOLESALE" && isWholesaleCustomer(customer))
      return toast.error("Select a retail customer for this sale.");
    if (saleType === "WHOLESALE" && !isWholesaleCustomer(customer))
      return toast.error(
        "Select a wholesale customer. This customer is configured as retail.",
      );
    setSelected(customer);
    setCustomerType("EXISTING");
    setDuplicate(null);
  }
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && !saving && setOpen(false)
          }
        >
          <form
            onSubmit={complete}
            className="card max-h-[94vh] w-full max-w-4xl overflow-y-auto p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
                  Checkout
                </p>
                <h2
                  id="checkout-title"
                  className="mt-1 text-2xl font-extrabold"
                >
                  Customer & payment
                </h2>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                aria-label="Close checkout"
              >
                <X />
              </button>
            </div>
            <div className="mt-6 grid gap-7 lg:grid-cols-[1.05fr_.95fr]">
              <section>
                <p className="label">Customer</p>
                <div
                  className={`grid ${saleType === "WHOLESALE" ? "grid-cols-2" : "grid-cols-3"} rounded-xl bg-[#eef2ee] p-1`}
                >
                  {(saleType === "WHOLESALE"
                    ? [
                        ["EXISTING", "Existing wholesale"],
                        ["NEW", "New wholesale"],
                      ]
                    : [
                        ["WALK_IN", "Walk-in"],
                        ["EXISTING", "Existing"],
                        ["NEW", "New customer"],
                      ]
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => chooseType(value)}
                      className={`rounded-lg px-2 py-2.5 text-xs font-extrabold transition ${customerType === value ? "bg-[var(--green)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {customerType === "WALK_IN" && (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                    <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--green)]">
                      <UserRound size={19} />
                    </span>
                    <h3 className="mt-4 font-extrabold">Walk-in Customer</h3>
                    <p className="mt-1 text-sm text-emerald-800">
                      Fast checkout without saving customer information.
                    </p>
                  </div>
                )}
                {customerType === "EXISTING" && (
                  <div className="mt-4">
                    {selected ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                        <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-emerald-700">
                          <Check size={15} />
                          Customer selected
                        </p>
                        <h3 className="mt-3 text-lg font-extrabold">
                          {selected.name}
                        </h3>
                        {selected.businessName && (
                          <p className="text-sm font-bold">
                            {selected.businessName}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {selected.phone || "No phone"}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {selected.email || "No email"}
                        </p>
                        {selected.gstin && (
                          <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                            GSTIN: {selected.gstin}
                          </p>
                        )}
                        {(selected.billingAddress || selected.address) && (
                          <p className="mt-2 text-sm">
                            {selected.billingAddress || selected.address}
                          </p>
                        )}
                        {saleType === "WHOLESALE" && (
                          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white/70 p-3 text-sm">
                            <span>
                              <small className="block text-[var(--muted)]">
                                Outstanding
                              </small>
                              <strong>{money(outstandingAmount)}</strong>
                            </span>
                            <span>
                              <small className="block text-[var(--muted)]">
                                Available credit
                              </small>
                              <strong>{money(availableCredit)}</strong>
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn mt-4"
                          onClick={() => setSelected(null)}
                        >
                          Change customer
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search
                            className="absolute left-3 top-3 text-[var(--muted)]"
                            size={18}
                          />
                          <input
                            autoFocus
                            className="field !pl-10"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={
                              saleType === "WHOLESALE"
                                ? "Search name, business, GSTIN, phone…"
                                : "Search name, phone, or email…"
                            }
                          />
                        </div>
                        {query.length < 2 && (
                          <p className="mt-3 text-sm text-[var(--muted)]">
                            Enter at least 2 characters to search.
                          </p>
                        )}
                        {searching && (
                          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
                            <LoaderCircle className="loading-shimmer-icon" size={16} />
                            Searching customers…
                          </div>
                        )}
                        {!searching && results.length > 0 && (
                          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                            {results.map((customer) => (
                              <button
                                type="button"
                                key={customer._id}
                                onClick={() => chooseExisting(customer)}
                                className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-left hover:border-[var(--green)]"
                              >
                                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] font-extrabold text-[var(--green)]">
                                  {customer.name.slice(0, 2).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <strong className="block truncate text-sm">
                                    {customer.name}
                                  </strong>
                                  {customer.businessName && (
                                    <span className="block truncate text-xs font-bold">
                                      {customer.businessName}
                                    </span>
                                  )}
                                  <span className="block truncate text-xs text-[var(--muted)]">
                                    {customer.phone || "No phone"} ·{" "}
                                    {customer.email ||
                                      customer.gstin ||
                                      "No email"}
                                  </span>
                                </span>
                                <span className="text-xs font-extrabold text-[var(--green)]">
                                  Select
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!searching && searched && !results.length && (
                          <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
                            <p className="font-extrabold">No customer found</p>
                            <button
                              type="button"
                              className="btn mt-3"
                              onClick={() => chooseType("NEW")}
                            >
                              <Plus size={15} />
                              {saleType === "WHOLESALE"
                                ? "Add new wholesale customer"
                                : "Add as new customer"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="mt-4 grid gap-3">
                  <label><span className="label">Fulfilment</span><select className="field" value={fulfilment} onChange={e=>setFulfilment(e.target.value)}><option value="COUNTER">Counter sale</option><option value="DELIVERY">Delivery of goods</option></select></label>
                  {fulfilment==="DELIVERY"&&<><label><span className="label">Delivery address</span><textarea className="field" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} required/></label><label><span className="label">Delivery state</span><select className="field" value={deliveryStateCode} onChange={e=>setDeliveryStateCode(e.target.value)} required><option value="">Select state</option>{GST_STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></>}
                  {settings?.discount?.enabled&&<label><span className="label">Discount reason</span><input className="field" value={discountReason} onChange={e=>setDiscountReason(e.target.value)} /></label>}
                </div>
                {customerType === "NEW" && (
                  <div className="mt-4 space-y-3">
                    <label>
                      <span className="label">Customer name *</span>
                      <input
                        autoFocus
                        className="field"
                        name="customerName"
                        required
                      />
                    </label>
                    {saleType === "WHOLESALE" && (
                      <label>
                        <span className="label">Business name</span>
                        <input className="field" name="businessName" />
                      </label>
                    )}
                    <label><span className="label">Customer state</span><select className="field" value={recipientStateCode} onChange={e=>setRecipientStateCode(e.target.value)}><option value="">Not recorded</option>{GST_STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
                    {saleType!=="WHOLESALE"&&<label><span className="label">GSTIN (registered customer only)</span><input className="field uppercase" name="retailGstin" value={newGstin} onChange={e=>setNewGstin(e.target.value.toUpperCase())} maxLength={15}/></label>}
                    <label>
                      <span className="label">Phone</span>
                      <input
                        className="field"
                        name="phone"
                        type="tel"
                        pattern="[0-9+ ()-]{7,18}"
                        title="Enter a valid phone number"
                      />
                    </label>
                    <label>
                      <span className="label">Email</span>
                      <input className="field" name="email" type="email" />
                    </label>
                    {saleType === "WHOLESALE" ? (
                      <>
                        <label>
                          <span className="label">GSTIN</span>
                          <input
                            className="field uppercase"
                            name="gstin" value={newGstin} onChange={e=>setNewGstin(e.target.value.toUpperCase())}
                            maxLength={15}
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span className="label">Billing address</span>
                          <textarea
                            className="field min-h-20"
                            name="billingAddress"
                          />
                        </label>
                        <label>
                          <span className="label">Shipping address</span>
                          <textarea
                            className="field min-h-20"
                            name="shippingAddress"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label>
                            <span className="label">Credit limit</span>
                            <input
                              className="field"
                              name="creditLimit"
                              type="number"
                              min="0"
                              step=".01"
                              value={newCreditLimit}
                              onChange={(event) =>
                                setNewCreditLimit(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span className="label">Default discount %</span>
                            <input
                              className="field"
                              name="defaultDiscount"
                              type="number"
                              min="0"
                              max="100"
                              step=".01"
                              defaultValue="0"
                            />
                          </label>
                        </div>
                        <label>
                          <span className="label">Notes</span>
                          <textarea className="field min-h-16" name="notes" />
                        </label>
                      </>
                    ) : (
                      <label>
                        <span className="label">Address</span>
                        <textarea className="field min-h-20" name="address" />
                      </label>
                    )}
                    {duplicate && (
                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                        <p className="text-xs font-extrabold uppercase text-orange-700">
                          Customer already exists
                        </p>
                        <strong className="mt-2 block">{duplicate.name}</strong>
                        <p className="text-sm text-[var(--muted)]">
                          {duplicate.phone}{" "}
                          {duplicate.email && `· ${duplicate.email}`}
                        </p>
                        {saleType !== "WHOLESALE" ||
                        isWholesaleCustomer(duplicate) ? (
                          <button
                            type="button"
                            className="btn mt-3"
                            onClick={() => chooseExisting(duplicate)}
                          >
                            Use existing customer
                          </button>
                        ) : (
                          <p className="mt-2 text-sm font-bold text-orange-800">
                            This record is a retail customer. Change it to
                            wholesale in Customers before using it here.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {saleType !== "WHOLESALE" && (
                  <label className="mt-4 block">
                    <span className="label">Doctor name</span>
                    <input
                      className="field"
                      name="doctorName"
                      maxLength={120}
                      placeholder="Enter prescribing doctor name"
                      autoComplete="off"
                    />
                  </label>
                )}
              </section>
              <section>
                <div className="rounded-2xl bg-[#f4f7f3] p-5">
                  <p className="label">Order summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Items</span>
                      <strong>{cart.length}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <strong>{money(subtotal)}</strong>
                    </div>
                    {discountEnabled && (
                      <>
                        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                          {settings.discount.allowFixed !== false &&
                            settings.discount.allowPercentage !== false && (
                              <select
                                className="field !min-h-10"
                                value={discountType}
                                onChange={(event) => {
                                  setDiscountType(event.target.value);
                                  setDiscountValue("");
                                }}
                                aria-label="Discount type"
                              >
                                <option value="FIXED">₹ Fixed</option>
                                <option value="PERCENTAGE">% Percent</option>
                              </select>
                            )}
                          <label
                            className={
                              settings.discount.allowFixed !== false &&
                              settings.discount.allowPercentage !== false
                                ? ""
                                : "col-span-2"
                            }
                          >
                            <span className="sr-only">Discount value</span>
                            <input
                              className="field !min-h-10"
                              type="number"
                              min="0"
                              max={
                                Number.isFinite(discountLimit)
                                  ? discountLimit
                                  : undefined
                              }
                              step="0.01"
                              value={discountValue}
                              onChange={(event) =>
                                setDiscountValue(event.target.value)
                              }
                              placeholder={
                                discountType === "PERCENTAGE"
                                  ? "Discount %"
                                  : "Discount amount"
                              }
                            />
                          </label>
                        </div>
                        {!discountValid && (
                          <p className="text-xs font-bold text-[var(--red)]">
                            Maximum allowed:{" "}
                            {discountType === "PERCENTAGE"
                              ? `${discountLimit}%`
                              : money(discountLimit)}
                          </p>
                        )}
                        <div className="flex justify-between text-[var(--green)]">
                          <span>Discount</span>
                          <strong>-{money(discount)}</strong>
                        </div>
                      </>
                    )}
                    {settings?.roundOff?.enabled && (
                      <div className="flex justify-between">
                        <span>Round off</span>
                        <strong>{money(roundOff)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-[var(--line)] pt-3 text-xl">
                      <strong>Total</strong>
                      <strong>{money(total)}</strong>
                    </div>
                  </div>
                </div>
                {showCheckoutGst && (
                  <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
                    {detailedGst ? (
                      <>
                        <div className="flex justify-between">
                          <span>Taxable amount</span>
                          <strong>{money(gstInvoice.taxableSubtotal)}</strong>
                        </div>
                        {gstInvoice.interstate ? (
                          <div className="mt-2 flex justify-between">
                            <span>IGST</span>
                            <strong>{money(gstInvoice.igst)}</strong>
                          </div>
                        ) : (
                          <>
                            <div className="mt-2 flex justify-between">
                              <span>CGST</span>
                              <strong>{money(gstInvoice.cgst)}</strong>
                            </div>
                            <div className="mt-2 flex justify-between">
                              <span>{gstInvoice.taxType==="CGST_UTGST"?"UTGST":"SGST"}</span>
                              <strong>{money(gstInvoice.taxType==="CGST_UTGST"?gstInvoice.utgst:gstInvoice.sgst)}</strong>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex justify-between">
                        <span>GST</span>
                        <strong>{money(gstInvoice.tax)}</strong>
                      </div>
                    )}
                    <p className="mt-2 border-t border-dashed pt-2 text-xs text-[var(--muted)]">
                      {gstInvoice.taxType === "IGST"
                        ? "Interstate · IGST"
                        : "Intrastate · CGST + SGST"}{" "}
                      · Prices are GST{" "}
                      {gstInvoice.priceMode === "INCLUSIVE"
                        ? "inclusive"
                        : "exclusive"}
                      .
                    </p>
                  </div>
                )}
                <p className="label mt-5">Payment method</p>
                <div
                  className={`grid ${saleType === "WHOLESALE" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"} gap-2`}
                >
                  {[
                    ["CASH", "Cash"],
                    ["UPI", "UPI"],
                    ["SPLIT", "Split"],
                    ...(saleType === "WHOLESALE"
                      ? [["CREDIT", "Credit"]]
                      : []),
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setPayment(value)}
                      className={`rounded-xl border px-2 py-3 text-sm font-extrabold ${payment === value ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]" : "border-[var(--line)]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {payment === "CASH" && (
                  <div className="mt-4 rounded-xl border border-[var(--line)] p-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--muted)]">
                        Amount due
                      </span>
                      <strong>{money(total)}</strong>
                    </div>
                    <label className="mt-4 block">
                      <span className="label">Cash received</span>
                      <input
                        className="field text-lg font-extrabold"
                        type="number"
                        min={total}
                        step=".01"
                        value={cashReceived}
                        onChange={(event) =>
                          setCashReceived(event.target.value)
                        }
                        placeholder="₹ 0"
                      />
                    </label>
                    <div className="mt-3 flex justify-between text-lg">
                      <strong>Change</strong>
                      <strong className="text-[var(--red)]">
                        {change > 0 ? `-${money(change)}` : money(0)}
                      </strong>
                    </div>
                    {cashReceived !== "" && change < 0 && (
                      <p className="mt-2 text-xs font-bold text-[var(--red)]">
                        Cash received is less than the amount due.
                      </p>
                    )}
                  </div>
                )}
                {payment === "UPI" && (
                  <div className="mt-4 rounded-xl border p-4">
                    <div className="flex justify-between">
                      <span>UPI amount</span>
                      <strong>{money(total)}</strong>
                    </div>
                    <label className="mt-4 block">
                      <span className="label">
                        Transaction / reference ID (optional)
                      </span>
                      <input
                        className="field"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                      />
                    </label>
                  </div>
                )}
                {payment === "SPLIT" && (
                  <div className="mt-4 rounded-xl border p-4">
                    <div className="flex justify-between">
                      <span>Total</span>
                      <strong>{money(total)}</strong>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label>
                        <span className="label">Cash</span>
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step=".01"
                          value={splitCash}
                          onChange={(event) => setSplitCash(event.target.value)}
                        />
                      </label>
                      <label>
                        <span className="label">UPI</span>
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step=".01"
                          value={splitUpi}
                          onChange={(event) => setSplitUpi(event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="label">UPI reference (optional)</span>
                      <input
                        className="field"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                      />
                    </label>
                    <div className="mt-4 flex justify-between border-t border-dashed pt-3">
                      <strong>Remaining</strong>
                      <strong
                        className={
                          Math.abs(splitRemaining) < 0.01
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                        }
                      >
                        {money(splitRemaining)}
                      </strong>
                    </div>
                  </div>
                )}
                {payment === "CREDIT" && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex justify-between">
                      <span>Invoice on credit</span>
                      <strong>{money(total)}</strong>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span>Available before sale</span>
                      <strong>{money(availableCredit)}</strong>
                    </div>
                    <div className="mt-3 flex justify-between border-t border-dashed border-amber-300 pt-3">
                      <strong>Outstanding after sale</strong>
                      <strong>{money(outstandingAmount + total)}</strong>
                    </div>
                    {!creditValid && (
                      <p className="mt-3 text-xs font-bold text-[var(--red)]">
                        {customerType === "EXISTING" && !selected
                          ? "Select a wholesale customer first."
                          : creditLimit <= 0
                            ? "Set a credit limit for this wholesale customer."
                            : `This invoice exceeds the available credit by ${money(total - availableCredit)}.`}
                      </p>
                    )}
                  </div>
                )}
                <button
                  disabled={saving || !paymentValid}
                  className="btn btn-primary mt-5 min-h-12 w-full"
                >
                  {saving ? (
                    <LoaderCircle className="loading-shimmer-icon" size={18} />
                  ) : (
                    <WalletCards size={18} />
                  )}{" "}
                  {saving
                    ? "Processing payment…"
                    : payment === "CREDIT"
                      ? `Complete ${money(total)} credit sale`
                      : `Complete ${money(total)} payment`}
                </button>
              </section>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
