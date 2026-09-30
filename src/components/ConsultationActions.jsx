"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical, Eye, Printer, Pencil, Trash2, Ban } from "lucide-react";

export default function ConsultationActions({ row, capabilities, onView, onPrint, onUpdate, onCancel, onDelete }) {
  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none focus:bg-[var(--green-soft)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><button type="button" className="btn !min-h-9 !p-2" aria-label={`Actions for ${row.opNumber}`}><MoreVertical size={18} /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-[90] min-w-48 rounded-xl border bg-white p-1.5 shadow-xl">
      <DropdownMenu.Item className={item} onSelect={onView}><Eye size={16} />View</DropdownMenu.Item>
      {capabilities.print && <DropdownMenu.Item className={item} onSelect={onPrint}><Printer size={16} />Print</DropdownMenu.Item>}
      {capabilities.edit && <DropdownMenu.Item className={item} disabled={row.status !== "COMPLETED"} onSelect={onUpdate}><Pencil size={16} />Update</DropdownMenu.Item>}
      {capabilities.cancel && row.status === "COMPLETED" && <DropdownMenu.Item className={item} onSelect={onCancel}><Ban size={16} />Cancel / Refund</DropdownMenu.Item>}
      {capabilities.delete && <><DropdownMenu.Separator className="my-1 border-t" /><DropdownMenu.Item className={`${item} text-red-700`} onSelect={onDelete}><Trash2 size={16} />Delete</DropdownMenu.Item></>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
