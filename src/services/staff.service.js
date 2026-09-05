import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {AuditLog,Expense,Purchase,Sale,StaffRole,User} from "@/models";
import {applyPermissionDependencies,ensureDefaultRoles,getEffectivePermissionObject,normalizePermissions,permissionLabel} from "@/services/rbac.service";
import {queryValues} from "@/lib/filter-utils";

const text=(value)=>String(value??"").trim();
const escapeRegex=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const passwordValid=(value)=>String(value||"").length>=8&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/\d/.test(value);
const objectId=(value)=>mongoose.isValidObjectId(value)?new mongoose.Types.ObjectId(value):null;

export async function writeAudit({actorId,action,module="staff",targetType="User",targetId,description,metadata={}}){return AuditLog.create({actorId,targetId,action,module,targetType,description,metadata});}

async function rolesAndMigration(){
  const roles=await ensureDefaultRoles(),custom=roles.find((role)=>role.slug==="custom-staff");
  if(custom)await User.updateMany({role:"STAFF",roleId:{$exists:false}},{$set:{roleId:custom._id}});
  return roles;
}

function serializeStaff(user){const permissions=getEffectivePermissionObject(user);return{...user,effectivePermissions:permissions,accessLabel:permissionLabel(permissions),status:user.active?"ACTIVE":"INACTIVE"};}

export async function getStaff(parameters){
  const roles=await rolesAndMigration(),filter={role:"STAFF"},search=text(parameters.get("search"));
  if(search){const regex=new RegExp(escapeRegex(search),"i"),matchingRoles=roles.filter((role)=>regex.test(role.name)).map((role)=>role._id);filter.$or=[{name:regex},{email:regex},{phone:regex},{roleId:{$in:matchingRoles}}];}
  const roleIds=queryValues(parameters,"role").map(objectId).filter(Boolean);if(roleIds.length)filter.roleId={$in:roleIds};
  const status=parameters.get("status");if(status==="ACTIVE")filter.active=true;if(status==="INACTIVE")filter.active=false;
  const permissions=queryValues(parameters,"permission");if(permissions.length){const permissionFilters=permissions.flatMap((permission)=>{const permittedRoles=roles.filter((entry)=>entry.permissions?.[permission]?.view).map((entry)=>entry._id);return[{permissions:permission},{[`permissionOverrides.${permission}.view`]:true},{roleId:{$in:permittedRoles}}];});filter.$and=[{$or:permissionFilters}];}
  const page=Math.max(1,Number(parameters.get("page"))||1),limit=Math.min(100,Math.max(1,Number(parameters.get("limit"))||20));
  const sortName={name:"name",role:"roleId",status:"active",lastActive:"lastActiveAt",created:"createdAt"}[parameters.get("sort")]||"active";
  const order=parameters.get("order")==="asc"?1:-1,sort=sortName==="active"?{active:-1,name:1}:{[sortName]:order,name:1};
  const [rows,total,active,inactive]=await Promise.all([User.find(filter).select("-passwordHash").populate("roleId").sort(sort).skip((page-1)*limit).limit(limit).lean(),User.countDocuments(filter),User.countDocuments({role:"STAFF",active:true}),User.countDocuments({role:"STAFF",active:false})]);
  return{rows:rows.map(serializeStaff),roles,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},kpis:{total:active+inactive,active,inactive,roles:new Set(rows.map((row)=>String(row.roleId?._id||""))).size}};
}

export async function getStaffDetails(id){
  const user=await User.findOne({_id:id,role:"STAFF"}).select("-passwordHash").populate("roleId").lean();if(!user)throw new Error("Staff account not found");
  const start=new Date();start.setHours(0,0,0,0);
  const [sales,purchases,expenses,audits]=await Promise.all([Sale.find({actorId:user._id}).select("invoiceNumber total createdAt").sort({createdAt:-1}).limit(30).lean(),Purchase.find({actorId:user._id}).select("purchaseNumber total createdAt purchasedAt").sort({createdAt:-1}).limit(30).lean(),Expense.find({actorId:user._id}).select("expenseNumber title amount createdAt expenseDate").sort({createdAt:-1}).limit(30).lean(),AuditLog.find({actorId:user._id}).select("action description module targetType targetId createdAt").sort({createdAt:-1}).limit(40).lean()]);
  const activity=[...sales.map((row)=>({id:`sale-${row._id}`,type:"SALE_CREATED",label:"Completed sale",reference:row.invoiceNumber,amount:row.total,date:row.createdAt})),...purchases.map((row)=>({id:`purchase-${row._id}`,type:"PURCHASE_CREATED",label:"Created purchase",reference:row.purchaseNumber,amount:row.total,date:row.createdAt||row.purchasedAt})),...expenses.map((row)=>({id:`expense-${row._id}`,type:"EXPENSE_CREATED",label:"Recorded expense",reference:row.expenseNumber||row.title,amount:row.amount,date:row.createdAt||row.expenseDate})),...audits.map((row)=>({id:`audit-${row._id}`,type:row.action,label:row.description||row.action.replaceAll("_"," "),reference:"",date:row.createdAt}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,50);
  return{staff:serializeStaff(user),activity,summary:{sales:sales.filter((row)=>new Date(row.createdAt)>=start).length,salesValue:sales.filter((row)=>new Date(row.createdAt)>=start).reduce((sum,row)=>sum+Number(row.total||0),0),purchases:purchases.filter((row)=>new Date(row.createdAt)>=start).length,expenses:expenses.filter((row)=>new Date(row.createdAt)>=start).length}};
}

export async function createStaff(body,actor){
  const roles=await rolesAndMigration(),name=text(body.name),email=text(body.email).toLowerCase(),phone=text(body.phone),password=String(body.password||"");
  if(!name||!email)throw new Error("Name and email are required");if(!passwordValid(password))throw new Error("Password must contain at least 8 characters, uppercase, lowercase, and a number");if(password!==String(body.confirmPassword||password))throw new Error("Passwords do not match");
  const role=roles.find((entry)=>String(entry._id)===String(body.roleId));if(!role)throw new Error("Select an active staff role");
  const canManagePermissions=actor.role==="ADMIN"||actor.permissions?.includes("staff.managePermissions");
  const user=await User.create({name,email,phone,passwordHash:await bcrypt.hash(password,12),role:"STAFF",roleId:role._id,permissionOverrides:canManagePermissions&&body.customizePermissions?applyPermissionDependencies(body.permissionOverrides):{},permissions:[],active:body.active!==false,mustChangePassword:Boolean(body.mustChangePassword),createdBy:actor.sub});
  await writeAudit({actorId:actor.sub,action:"STAFF_CREATED",targetId:user._id,description:`Created staff account for ${user.name}`,metadata:{role:role.name}});return getStaffDetails(user._id);
}

export async function updateStaff(id,body,actor){
  const user=await User.findOne({_id:id,role:"STAFF"});if(!user)throw new Error("Staff account not found");const role=await StaffRole.findOne({_id:body.roleId,active:true});if(!role)throw new Error("Select an active staff role");
  user.name=text(body.name);user.email=text(body.email).toLowerCase();user.phone=text(body.phone);user.roleId=role._id;const canManagePermissions=actor.role==="ADMIN"||actor.permissions?.includes("staff.managePermissions");if(canManagePermissions&&Object.hasOwn(body,"customizePermissions"))user.permissionOverrides=body.customizePermissions?applyPermissionDependencies(body.permissionOverrides):{};if(typeof body.active==="boolean")user.active=body.active;if(!user.name||!user.email)throw new Error("Name and email are required");await user.save();
  await writeAudit({actorId:actor.sub,action:"STAFF_UPDATED",targetId:user._id,description:`Updated staff account for ${user.name}`,metadata:{role:role.name}});return getStaffDetails(user._id);
}

export async function setStaffStatus(id,active,reason,actor){const user=await User.findOne({_id:id,role:"STAFF"});if(!user)throw new Error("Staff account not found");user.active=active;user.deactivatedAt=active?null:new Date();user.deactivatedBy=active?null:actor.sub;user.deactivationReason=active?"":text(reason);await user.save();await writeAudit({actorId:actor.sub,action:active?"STAFF_REACTIVATED":"STAFF_DEACTIVATED",targetId:user._id,description:`${active?"Reactivated":"Deactivated"} ${user.name}`,metadata:{reason:text(reason)}});return getStaffDetails(user._id);}
export async function resetStaffPassword(id,body,actor){const password=String(body.password||"");if(!passwordValid(password))throw new Error("Password must contain at least 8 characters, uppercase, lowercase, and a number");if(password!==String(body.confirmPassword||""))throw new Error("Passwords do not match");const user=await User.findOne({_id:id,role:"STAFF"});if(!user)throw new Error("Staff account not found");user.passwordHash=await bcrypt.hash(password,12);user.mustChangePassword=Boolean(body.mustChangePassword);user.authVersion=Number(user.authVersion||0)+1;await user.save();await writeAudit({actorId:actor.sub,action:"PASSWORD_RESET",targetId:user._id,description:`Reset password for ${user.name}`});return{success:true};}

export async function createRole(body,actor){const name=text(body.name);if(!name)throw new Error("Role name is required");const role=await StaffRole.create({name,slug:name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""),description:text(body.description),permissions:applyPermissionDependencies(body.permissions),createdBy:actor.sub});await writeAudit({actorId:actor.sub,action:"ROLE_CREATED",targetType:"StaffRole",targetId:role._id,description:`Created role ${role.name}`});return role;}
export async function updateRole(id,body,actor){const role=await StaffRole.findById(id);if(!role)throw new Error("Role not found");if(role.systemRole&&body.name&&body.name!==role.name)throw new Error("System role names cannot be changed");role.description=text(body.description??role.description);role.permissions=applyPermissionDependencies(body.permissions||role.permissions);await role.save();await writeAudit({actorId:actor.sub,action:"ROLE_UPDATED",targetType:"StaffRole",targetId:role._id,description:`Updated role ${role.name}`});return role;}
export async function deleteRole(id,actor){const role=await StaffRole.findById(id);if(!role)throw new Error("Role not found");if(role.systemRole)throw new Error("System roles cannot be deleted");const count=await User.countDocuments({role:"STAFF",roleId:role._id});if(count)throw new Error(`This role is assigned to ${count} staff member${count===1?"":"s"}`);await role.deleteOne();await writeAudit({actorId:actor.sub,action:"ROLE_DELETED",targetType:"StaffRole",targetId:role._id,description:`Deleted role ${role.name}`});return{deleted:true};}
export async function getRoles(){const roles=await rolesAndMigration(),counts=await User.aggregate([{$match:{role:"STAFF"}},{$group:{_id:"$roleId",count:{$sum:1}}}]);const byId=new Map(counts.map((entry)=>[String(entry._id),entry.count]));return roles.map((role)=>({...role,staffCount:byId.get(String(role._id))||0}));}
export {normalizePermissions};
