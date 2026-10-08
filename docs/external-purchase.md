# External Purchase

Use **+ External Purchase** beside Sales search. The modal contains manual Product Name, Quantity, Unit, Selling Price per unit, and optional Notes. It has no existing-product selector, purchase-cost field, supplier field, or supplier payment selector. Product cards do not offer an external-purchase action, and unavailable inventory products retain normal stock validation.

External lines stay in the normal cart and invoice. Edit details or quantity in Current Sale. They use `itemSource: external_purchase` and `inventoryTracked: false` and never consume or restore inventory, even when a historical line references a product. Ordinary products cannot disable stock validation through a forged request.

New selling-price-only lines require no supplier information and create no supplier expense or cash outflow. Their profit is unavailable because purchase cost was not recorded. Historical supplier/cost snapshots and existing linked expenses remain preserved; editing historical entries continues to use the existing accounting synchronization. Removing a completed-sale charge does not establish a supplier refund.

Customer receipts show name, quantity, unit, selling price, and total. Cart entries show the External Purchase badge and an Edit details action, with no purchase-cost display. Existing discount, GST, rounding, customer-payment, and retry rules continue to apply. GST-enabled issuance still requires the existing verified classification; a manually entered item cannot bypass those checks.

The repository has no sale refund/cancellation, return, deletion, or day-closing endpoint. This feature does not introduce those workflows. Future stock returns must use inventory allocations and exclude external lines; customer refunds and supplier reimbursement remain separate events.

Automated tests cover selling-price-only checkout with no expense or stock movement, normal/mixed checkout, historical costs, retries, edits, permissions, reports, and rendered receipt privacy. Browser interaction, live MongoDB transactions, physical printing, and deployment require separate verification.
