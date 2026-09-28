import mongoose from "mongoose";
import {connectDb} from "@/lib/db";import {requireSession} from "@/lib/auth";import {ok,fail,apiError} from "@/lib/api";import {Category,Product} from "@/models";
const slugify=(v)=>String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
export async function GET(){try{await requireSession("products.view");await connectDb();const rows=await Category.aggregate([{$sort:{name:1}},{$lookup:{from:"products",localField:"_id",foreignField:"categoryId",as:"products"}},{$project:{name:1,slug:1,description:1,isSystem:1,active:1,productCount:{$size:"$products"}}}]);return ok(rows);}catch(e){return apiError(e);}}
export async function POST(request){try{await requireSession("products.create");await connectDb();const{name,description=""}=await request.json();if(!String(name||"").trim())return fail("Category name is required");return ok(await Category.create({name:String(name).trim(),slug:slugify(name),description}),201);}catch(e){return apiError(e);}}
export async function PUT(request) {
  try {
    await requireSession("products.edit");
    await connectDb();
    const { id, name, description = "" } = await request.json();
    if (!mongoose.isValidObjectId(id)) return fail("Invalid category");
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return fail("Category name is required");
    const category = await Category.findById(id);
    if (!category) return fail("Category not found", 404);
    // System slugs are used by product filters and must remain stable.
    const slug = category.isSystem ? category.slug : slugify(trimmedName);
    if (await Category.exists({ _id: { $ne: id }, slug })) return fail("A category with this name already exists", 409);
    category.set({ name: trimmedName, description: String(description).trim(), slug });
    await category.save();
    return ok(category);
  } catch (error) { return apiError(error); }
}
export async function DELETE(request){try{await requireSession("ADMIN");await connectDb();const id=new URL(request.url).searchParams.get("id");if(await Product.exists({categoryId:id}))return fail("This category is in use. Disable it instead.",409);await Category.findByIdAndDelete(id);return ok({success:true});}catch(e){return apiError(e);}}
