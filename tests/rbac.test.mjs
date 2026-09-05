import test from "node:test";
import assert from "node:assert/strict";
import {applyPermissionDependencies,flattenPermissions,getEffectivePermissionObject,hasPermission} from "../src/services/rbac.service.js";

test("action permissions automatically include module view access",()=>{
  const permissions=applyPermissionDependencies({sales:{create:true},products:{stockAdjust:true}});
  assert.equal(permissions.sales.view,true);
  assert.equal(permissions.products.view,true);
});

test("employee overrides can grant and revoke role actions",()=>{
  const user={role:"STAFF",permissions:[],roleId:{permissions:{sales:{view:true,create:true},reports:{view:true}}},permissionOverrides:{sales:{create:false,refund:true}}};
  const permissions=getEffectivePermissionObject(user);
  assert.equal(Boolean(permissions.sales.create),false);
  assert.equal(permissions.sales.refund,true);
  assert.equal(hasPermission(user,"sales.refund"),true);
  assert.equal(hasPermission(user,"staff.view"),false);
});

test("owner access is complete and legacy module permissions remain view-only",()=>{
  const owner=flattenPermissions(getEffectivePermissionObject({role:"ADMIN"}));
  assert.equal(owner.includes("staff.manageRoles"),true);
  const legacy={role:"STAFF",permissions:["customers"],permissionOverrides:{},roleId:null};
  assert.equal(hasPermission(legacy,"customers.view"),true);
  assert.equal(hasPermission(legacy,"customers.edit"),false);
});
