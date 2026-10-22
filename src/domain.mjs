import {ContractError, amount, identifier, isoDate, language, object, operationId, requireScope, snapshotMeta, text, READ_SCOPE, WRITE_SCOPE} from "./contract.mjs";

const DAY = 86_400_000;
const copy = value => structuredClone(value);
const active = value => !value.deletedAt;
const dateDiff = (a,b) => Math.floor((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const todayIso = now => new Date(now).toISOString().slice(0,10);
const byId = (items,id,label) => { const found=items.find(item=>item.id===id&&active(item)); if(!found)throw new ContractError("not_found",`${label} not found.`); return found; };
const safeBatch = (snapshot,batch) => {
  const product = snapshot.products.find(p=>p.id===batch.productId&&active(p));
  if (!product) return null;
  return {id:batch.id,product_id:product.id,name:product.name,brand:product.brand,category:product.category,barcode:product.barcode,package_size:product.sizeValue,package_unit:product.sizeUnit,space_id:batch.spaceId,storage_location_id:batch.storageLocationId,initial_quantity:batch.initialQuantity,remaining_quantity:batch.remainingQuantity,expiry_date:batch.expiryDate,added_at:batch.addedAt};
};
function visibleBatches(snapshot,args={}) {
  const spaceId=args.space_id===undefined?undefined:identifier(args.space_id,"space_id");
  const locationId=args.storage_location_id===undefined?undefined:identifier(args.storage_location_id,"storage_location_id");
  if(spaceId)byId(snapshot.spaces,spaceId,"Space");
  if(locationId)byId(snapshot.storageLocations,locationId,"Storage location");
  return snapshot.batches.filter(active).filter(b=>b.remainingQuantity>0&&(!spaceId||b.spaceId===spaceId)&&(!locationId||b.storageLocationId===locationId)).map(b=>safeBatch(snapshot,b)).filter(Boolean);
}
function response(snapshot,data){return {...snapshotMeta(snapshot),data};}
function previousOperation(snapshot,id,tool,args){const prior=snapshot.operations.find(op=>op.id===id);if(prior&&(prior.tool!==tool||JSON.stringify(prior.arguments)!==JSON.stringify(args)))throw new ContractError("idempotency_conflict","operation_id was already used for different input.");return prior;}
function addPending(snapshot, auth, tool, args, summary) {
  requireScope(auth, WRITE_SCOPE);
  const id=operationId(args.operation_id), prior=previousOperation(snapshot,id,tool,args);
  if(prior)return response(snapshot,{operation:copy(prior),replayed:true});
  const op={id,tool,arguments:copy(args),summary,status:"pending_confirmation",requestedBy:auth.userId,createdAt:new Date().toISOString(),revision:snapshot.revision+1};
  snapshot.operations.push(op); snapshot.revision++; snapshot.synchronizedAt=new Date().toISOString();
  return response(snapshot,{operation:copy(op),requires_user_confirmation:true,replayed:false});
}
const id={type:"string",minLength:1,maxLength:160,pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]*$"},operation={...id,minLength:8},quantity={type:"number",exclusiveMinimum:0,maximum:1_000_000_000},unit={type:"string",minLength:1,maxLength:24};
const schema=(properties={},required=[])=>({type:"object",properties,required,additionalProperties:false});
const shortList=(maxItems=20,maxLength=120)=>({type:"array",maxItems,items:{type:"string",minLength:1,maxLength}});
const title=name=>name.split("_").map(word=>word[0].toUpperCase()+word.slice(1)).join(" ");
const define=(name,description,inputSchema,readOnlyHint,destructiveHint=false)=>{
  const scopes=[readOnlyHint?READ_SCOPE:WRITE_SCOPE];
  const securitySchemes=[{type:"oauth2",scopes}];
  return {
    name,
    title:title(name),
    description,
    inputSchema,
    securitySchemes,
    _meta:{securitySchemes},
    annotations:{readOnlyHint,destructiveHint,idempotentHint:true,openWorldHint:false}
  };
};
const filters={space_id:id,storage_location_id:id};
export const toolDefinitions = [
 define("list_spaces","List authorized StillMore Spaces.",schema(),true),
 define("list_inventory","List available inventory, optionally filtered by Space or storage location.",schema(filters),true),
 define("get_inventory_item","Get one inventory batch by stable ID.",schema({item_id:id},["item_id"]),true),
 define("list_expiring_items","List available items expiring within a bounded number of days.",schema({...filters,days:{type:"integer",minimum:0,maximum:365}}),true),
 define("list_expired_items","List expired items. These must not be suggested for consumption.",schema(filters),true),
 define("get_storage_locations","List storage locations, optionally in one Space.",schema({space_id:id}),true),
 define("get_holiday_periods","List Away periods that affect expiry urgency.",schema(),true),
 define("export_inventory","Return a structured inventory export.",schema(filters),true),
 define("get_meal_context","Return verified inventory and bounded planning constraints for one meal or a multi-day assistant-generated menu. This tool never generates or stores recipes.",schema({mode:{type:"string",enum:["use_what_i_own","allow_purchases"]},objective:{type:"string",enum:["use_what_i_own","finish_expiring_first","maximize_inventory_use","minimize_purchases","balanced_week","custom"]},space_id:id,people:{type:"integer",minimum:1,maximum:100},total_portions:{type:"integer",minimum:1,maximum:500},days:{type:"integer",minimum:1,maximum:14},meals_per_day:{type:"integer",minimum:1,maximum:6},max_missing_ingredients:{type:"integer",minimum:0,maximum:20},max_prep_minutes:{type:"integer",minimum:1,maximum:1440},dietary_preferences:shortList(),allergies:shortList(),restrictions:shortList(),excluded_ingredients:shortList(),preferred_cuisines:shortList(),available_equipment:shortList(),allow_leftovers:{type:"boolean"},previous_meals:shortList(42,160),language:{type:"string",enum:["en","it","cs"]}},["mode","objective","space_id"]),true),
 define("list_shopping_lists","List shopping lists.",schema(),true),
 define("get_shopping_list","Get a shopping list and its entries.",schema({list_id:id},["list_id"]),true),
 define("create_shopping_list","Create an offline-synchronizable shopping list after the user approves saving it.",schema({operation_id:operation,list_id:id,name:{type:"string",minLength:1,maxLength:120},space_id:id},["operation_id","name","space_id"]),false),
 define("add_shopping_items","Add reviewed proposed purchases to a shopping list after explicit user approval.",schema({operation_id:operation,list_id:id,items:{type:"array",minItems:1,maxItems:50,items:schema({item_id:id,name:{type:"string",minLength:1,maxLength:160},normalized_ingredient:{type:"string",maxLength:160},quantity,unit,source_recipe:{type:"string",maxLength:240},notes:{type:"string",maxLength:500}},["name","quantity","unit"])}},["operation_id","list_id","items"]),false),
 define("update_shopping_item","Update a shopping entry.",schema({operation_id:operation,item_id:id,expected_revision:{type:"integer",minimum:1},name:{type:"string",minLength:1,maxLength:160},quantity,unit,notes:{type:"string",maxLength:500}},["operation_id","item_id","expected_revision"]),false),
 define("remove_shopping_item","Remove a shopping entry.",schema({operation_id:operation,item_id:id,expected_revision:{type:"integer",minimum:1}},["operation_id","item_id","expected_revision"]),false,true),
 define("mark_shopping_item_purchased","Mark a planned purchase as purchased without creating inventory.",schema({operation_id:operation,item_id:id,expected_revision:{type:"integer",minimum:1}},["operation_id","item_id","expected_revision"]),false),
 define("create_inventory_item","Queue stock creation for confirmation in StillMore.",schema({operation_id:operation,name:{type:"string",minLength:1,maxLength:160},quantity,unit,space_id:id,storage_location_id:id,expiry_date:{type:"string",format:"date"}},["operation_id","name","quantity","unit","space_id","storage_location_id","expiry_date"]),false),
 define("update_inventory_item","Queue an inventory edit for confirmation in StillMore.",schema({operation_id:operation,item_id:id,name:{type:"string",minLength:1,maxLength:160},expiry_date:{type:"string",format:"date"}},["operation_id","item_id"]),false),
 define("record_consumption","Queue a retry-safe consumption proposal for confirmation in StillMore. Never call this while only generating a recipe.",schema({operation_id:operation,item_id:id,quantity,unit},["operation_id","item_id","quantity"]),false,true),
 define("move_inventory_item","Queue a stock move for confirmation in StillMore.",schema({operation_id:operation,item_id:id,space_id:id,storage_location_id:id},["operation_id","item_id","space_id","storage_location_id"]),false)
];

export function createEmptySnapshot(userId, now=new Date().toISOString()) { return {schemaVersion:1,userId,revision:0,synchronizedAt:now,language:"en",spaces:[],storageLocations:[],products:[],batches:[],awayPeriods:[],shoppingLists:[],shoppingItems:[],operations:[],appliedOperationIds:[]}; }

export async function callTool(repository, auth, name, rawArgs={}) {
  requireScope(auth, name.startsWith("list_")||name.startsWith("get_")||name==="export_inventory"?READ_SCOPE:WRITE_SCOPE);
  const args=object(rawArgs,"arguments"), snapshot=await repository.read(auth.userId);
  if(!snapshot)throw new ContractError("not_linked","No synchronized StillMore data is available for this account.");
  if(snapshot.userId!==auth.userId)throw new ContractError("forbidden","Snapshot ownership mismatch.");
  let result;
  switch(name){
    case "list_spaces": result=response(snapshot,snapshot.spaces.filter(active).map(({id,name,kind})=>({id,name,kind}))); break;
    case "get_storage_locations": {const space=args.space_id===undefined?undefined:identifier(args.space_id,"space_id");result=response(snapshot,snapshot.storageLocations.filter(active).filter(x=>!space||x.spaceId===space));break;}
    case "get_holiday_periods": result=response(snapshot,snapshot.awayPeriods.filter(active)); break;
    case "list_inventory": result=response(snapshot,visibleBatches(snapshot,args)); break;
    case "get_inventory_item": {const batch=byId(snapshot.batches,identifier(args.item_id,"item_id"),"Inventory item"),item=safeBatch(snapshot,batch);if(!item)throw new ContractError("not_found","Product not found.");result=response(snapshot,item);break;}
    case "list_expiring_items": {const days=args.days===undefined?7:Math.min(365,Math.max(0,Math.trunc(amount(args.days,"days",{allowZero:true}))));const today=todayIso(Date.now());result=response(snapshot,visibleBatches(snapshot,args).filter(x=>{const d=dateDiff(x.expiry_date,today);return d>=0&&d<=days;}));break;}
    case "list_expired_items": {const today=todayIso(Date.now());result=response(snapshot,visibleBatches(snapshot,args).filter(x=>dateDiff(x.expiry_date,today)<0).map(x=>({...x,food_safety:"expired_do_not_recommend_for_consumption"})));break;}
    case "export_inventory": result=response(snapshot,{spaces:snapshot.spaces.filter(active),storage_locations:snapshot.storageLocations.filter(active),inventory:visibleBatches(snapshot,args)});break;
    case "get_meal_context": {
      const mode=args.mode==="allow_purchases"?"allow_purchases":"use_what_i_own",objectives=new Set(["use_what_i_own","finish_expiring_first","maximize_inventory_use","minimize_purchases","balanced_week","custom"]),objective=objectives.has(args.objective)?args.objective:"use_what_i_own",space=identifier(args.space_id,"space_id"),people=args.people===undefined?undefined:Math.min(100,Math.max(1,Math.trunc(args.people))),totalPortions=args.total_portions===undefined?people:Math.min(500,Math.max(1,Math.trunc(args.total_portions))),days=Math.min(14,Math.max(1,Math.trunc(args.days??1))),mealsPerDay=Math.min(6,Math.max(1,Math.trunc(args.meals_per_day??1))),maxMissing=mode==="allow_purchases"?Math.min(20,Math.max(0,Math.trunc(args.max_missing_ingredients??3))):0,today=todayIso(Date.now());
      if(people!==undefined&&totalPortions!==undefined&&totalPortions<people)throw new ContractError("invalid_input","total_portions must be at least people.");
      const boundedList=(value,max=20)=>Array.isArray(value)?value.filter(x=>typeof x==="string"&&x.trim()).slice(0,max).map(x=>x.trim().slice(0,160)):[];
      byId(snapshot.spaces,space,"Space");const all=visibleBatches(snapshot,{space_id:space}),available=all.filter(x=>dateDiff(x.expiry_date,today)>=0).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date)),excluded=all.filter(x=>dateDiff(x.expiry_date,today)<0).map(x=>({item_id:x.id,name:x.name,reason:"expired_do_not_use"}));
      result=response(snapshot,{mode,objective,space_id:space,people,total_portions:totalPortions,planned_extra_portions:people!==undefined&&totalPortions!==undefined?totalPortions-people:undefined,days,meals_per_day:mealsPerDay,max_missing_ingredients:maxMissing,max_prep_minutes:Number.isInteger(args.max_prep_minutes)?args.max_prep_minutes:undefined,dietary_preferences:boundedList(args.dietary_preferences),allergies:boundedList(args.allergies),restrictions:boundedList(args.restrictions),excluded_ingredients:boundedList(args.excluded_ingredients),preferred_cuisines:boundedList(args.preferred_cuisines),available_equipment:boundedList(args.available_equipment),allow_leftovers:args.allow_leftovers===true,previous_meals:boundedList(args.previous_meals,42),language:language(args.language??snapshot.language),available_ingredients:available,excluded_items:excluded,instructions:"Scale recipe ingredients to total_portions. Use people for the immediate serving explanation and identify extra meal-prep or freezer portions. Allocate quantities across meals without exceeding available stock. Treat unknown allergen data as unknown, not safe. Verify packaging. Label missing ingredients and unused urgent stock. Recipe generation does not change inventory or store the menu."});break;
    }
    case "list_shopping_lists": result=response(snapshot,snapshot.shoppingLists.filter(active));break;
    case "get_shopping_list": {const list=byId(snapshot.shoppingLists,identifier(args.list_id,"list_id"),"Shopping list");result=response(snapshot,{...list,items:snapshot.shoppingItems.filter(x=>x.listId===list.id&&active(x))});break;}
    case "create_shopping_list": {
      const op=operationId(args.operation_id), prior=previousOperation(snapshot,op,name,args);if(prior){result=response(snapshot,{shopping_list:copy(byId(snapshot.shoppingLists,prior.resultId,"Shopping list")),replayed:true});break;}
      const list={id:args.list_id?identifier(args.list_id,"list_id"):`list:${op}`,name:text(args.name,"name",{max:120}),spaceId:identifier(args.space_id,"space_id"),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:1};byId(snapshot.spaces,list.spaceId,"Space");if(snapshot.shoppingLists.some(x=>x.id===list.id))throw new ContractError("conflict","Shopping list ID already exists.");snapshot.shoppingLists.push(list);snapshot.operations.push({id:op,tool:name,arguments:copy(args),status:"applied",resultId:list.id,createdAt:list.createdAt});snapshot.revision++;snapshot.synchronizedAt=list.updatedAt;await repository.write(auth.userId,snapshot);return response(snapshot,{shopping_list:copy(list),replayed:false});
    }
    case "add_shopping_items": {
      const list=byId(snapshot.shoppingLists,identifier(args.list_id,"list_id"),"Shopping list"),items=Array.isArray(args.items)?args.items:[];if(!items.length||items.length>50)throw new ContractError("invalid_input","items must contain 1 to 50 entries.");const op=operationId(args.operation_id),prior=previousOperation(snapshot,op,name,args);if(prior){result=response(snapshot,{item_ids:prior.resultIds,replayed:true});break;}
      const created=items.map((raw,index)=>{const item=object(raw,`items[${index}]`);return{id:item.item_id?identifier(item.item_id,"item_id"):`item:${op}:${index}`,listId:list.id,name:text(item.name,"name",{max:160}),normalizedIngredient:typeof item.normalized_ingredient==="string"?item.normalized_ingredient.trim().slice(0,160):undefined,quantity:amount(item.quantity??1),unit:text(item.unit??"pcs","unit",{max:24}),spaceId:list.spaceId,status:"planned",sourceRecipe:typeof item.source_recipe==="string"?item.source_recipe.trim().slice(0,240):undefined,notes:typeof item.notes==="string"?item.notes.trim().slice(0,500):undefined,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:1};});
      const activeItems=snapshot.shoppingItems.filter(active);for(const item of created){if(activeItems.some(x=>x.id===item.id))throw new ContractError("conflict","Shopping item ID already exists.");const duplicate=activeItems.find(x=>x.listId===list.id&&x.status==="planned"&&x.name.toLocaleLowerCase()===item.name.toLocaleLowerCase()&&x.unit===item.unit);if(duplicate){duplicate.quantity=Math.round((duplicate.quantity+item.quantity)*1000)/1000;duplicate.updatedAt=item.updatedAt;duplicate.revision++;item.id=duplicate.id;}else snapshot.shoppingItems.push(item);}list.updatedAt=new Date().toISOString();list.revision++;snapshot.operations.push({id:op,tool:name,arguments:copy(args),status:"applied",resultIds:created.map(x=>x.id),createdAt:list.updatedAt});snapshot.revision++;snapshot.synchronizedAt=list.updatedAt;await repository.write(auth.userId,snapshot);return response(snapshot,{item_ids:created.map(x=>x.id),replayed:false});
    }
    case "update_shopping_item": case "remove_shopping_item": case "mark_shopping_item_purchased": {
      const item=byId(snapshot.shoppingItems,identifier(args.item_id,"item_id"),"Shopping item"),op=operationId(args.operation_id),prior=previousOperation(snapshot,op,name,args);if(prior){result=response(snapshot,{item:copy(item),replayed:true});break;}if(!Number.isInteger(args.expected_revision)||args.expected_revision!==item.revision)throw new ContractError("sync_conflict","Shopping item changed. Refresh it before editing.",{current_revision:item.revision});const now=new Date().toISOString();
      if(name==="remove_shopping_item")item.deletedAt=now;else if(name==="mark_shopping_item_purchased"){item.status="purchased";item.purchasedAt=now;}else{if(args.name!==undefined)item.name=text(args.name,"name",{max:160});if(args.quantity!==undefined)item.quantity=amount(args.quantity);if(args.unit!==undefined)item.unit=text(args.unit,"unit",{max:24});if(args.notes!==undefined)item.notes=args.notes?text(args.notes,"notes",{max:500}):undefined;}
      item.updatedAt=now;item.revision++;snapshot.operations.push({id:op,tool:name,arguments:copy(args),status:"applied",resultId:item.id,createdAt:now});snapshot.revision++;snapshot.synchronizedAt=now;await repository.write(auth.userId,snapshot);return response(snapshot,{item:copy(item),replayed:false,inventory_changed:false});
    }
    case "create_inventory_item": case "update_inventory_item": case "record_consumption": case "move_inventory_item": {
      if(name!=="create_inventory_item")byId(snapshot.batches,identifier(args.item_id,"item_id"),"Inventory item");if(name==="record_consumption")amount(args.quantity,"quantity");result=addPending(snapshot,auth,name,args,`StillMore must confirm ${name.replaceAll("_"," ")}.`);await repository.write(auth.userId,snapshot);return result;
    }
    default: throw new ContractError("unknown_tool",`Unknown tool: ${name}`);
  }
  return result;
}
