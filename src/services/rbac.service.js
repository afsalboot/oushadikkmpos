import {StaffRole} from "../models/index.js";

export const PERMISSION_CATALOG={
  dashboard:["view"],sales:["view","create","edit","cancel","refund","print"],products:["view","create","edit","deactivate","stockAdjust","manageBatches","import"],customers:["view","create","edit","deactivate","export"],purchases:["view","create","edit","cancel","print"],expenses:["view","create","edit","void","manageCategories","export"],accounts:["view","export","adjustment","viewBalances"],reports:["view","sales","inventory","purchases","expenses","customers","accounts","profitability","staff","export"],staff:["view","create","edit","deactivate","managePermissions","manageRoles","resetPassword"],settings:["view","edit"],
};

const view=(...modules)=>Object.fromEntries(modules.map((module)=>[module,{view:true}]));
const defaultRoles=[
  {name:"Manager",slug:"manager",description:"Operations, finance visibility and reports.",systemRole:true,permissionVersion:2,permissions:{dashboard:{view:true},sales:{view:true,create:true,edit:true,print:true},products:{view:true,edit:true},customers:{view:true,create:true,edit:true},purchases:{view:true,create:true,edit:true,print:true},expenses:{view:true,create:true,edit:true,export:true},accounts:{view:true,export:true,viewBalances:true},reports:{view:true,sales:true,inventory:true,purchases:true,expenses:true,customers:true,accounts:true,profitability:true,staff:true,export:true},staff:{view:true},settings:{view:true}}},
  {name:"Cashier",slug:"cashier",description:"Checkout staff with sales and customer access.",systemRole:true,permissionVersion:2,permissions:{dashboard:{view:true},sales:{view:true,create:true,print:true},products:{view:true},customers:{view:true,create:true,edit:true},reports:{view:true,sales:true,customers:true}}},
  {name:"Inventory Staff",slug:"inventory-staff",description:"Products, stock and purchasing operations.",systemRole:true,permissionVersion:2,permissions:{dashboard:{view:true},sales:{view:true},products:{view:true,create:true,edit:true,stockAdjust:true,manageBatches:true,import:true},customers:{view:true},purchases:{view:true,create:true,edit:true},reports:{view:true,inventory:true,purchases:true}}},
  {name:"Custom Staff",slug:"custom-staff",description:"Base role for individually configured employee access.",systemRole:true,permissions:view("dashboard")},
];

export async function ensureDefaultRoles(){
  await Promise.all(defaultRoles.map((role)=>StaffRole.findOneAndUpdate({slug:role.slug},{$setOnInsert:role},{upsert:true,setDefaultsOnInsert:true})));
  await Promise.all(defaultRoles.filter((role)=>role.permissionVersion===2).map((role)=>StaffRole.updateOne({slug:role.slug,permissionVersion:{$ne:2}},{$set:{"permissions.reports":role.permissions.reports,permissionVersion:2}})));
  return StaffRole.find({active:true}).sort({systemRole:-1,name:1}).lean();
}

export function normalizePermissions(value={}){
  const result={};
  for(const[module,actions]of Object.entries(PERMISSION_CATALOG))for(const action of actions)if(value?.[module]?.[action]===true){result[module]||={};result[module][action]=true;}
  return result;
}

export function applyPermissionDependencies(value={}){
  const result=normalizePermissions(value);
  for(const[module,actions]of Object.entries(result))if(Object.entries(actions).some(([action,enabled])=>action!=="view"&&enabled))actions.view=true;
  return result;
}

export function getEffectivePermissionObject(user){
  if(user.role==="ADMIN")return Object.fromEntries(Object.entries(PERMISSION_CATALOG).map(([module,actions])=>[module,Object.fromEntries(actions.map((action)=>[action,true]))]));
  const base=normalizePermissions(user.roleId?.permissions||{}),overrides=user.permissionOverrides||{};
  for(const[module,actions]of Object.entries(overrides))for(const[action,enabled]of Object.entries(actions||{})){if(!PERMISSION_CATALOG[module]?.includes(action))continue;base[module]||={};base[module][action]=Boolean(enabled);}
  for(const moduleName of user.permissions||[]){if(!PERMISSION_CATALOG[moduleName])continue;base[moduleName]||={};base[moduleName].view=true;}
  return applyPermissionDependencies(base);
}

export function flattenPermissions(value={}){return Object.entries(value).flatMap(([module,actions])=>Object.entries(actions).filter(([,enabled])=>enabled).map(([action])=>`${module}.${action}`));}
export function hasPermission(user,requirement){if(user.role==="ADMIN")return true;const permission=requirement.includes(".")?requirement:`${requirement}.view`;return flattenPermissions(getEffectivePermissionObject(user)).includes(permission);}
export function permissionLabel(value={}){const modules=Object.entries(value).filter(([,actions])=>actions?.view).map(([module])=>module.charAt(0).toUpperCase()+module.slice(1));return modules.length>3?`${modules.slice(0,3).join(", ")} +${modules.length-3}`:modules.join(", ")||"No access";}
