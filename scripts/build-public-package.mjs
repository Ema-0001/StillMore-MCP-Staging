import {mkdir,readFile,writeFile,copyFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const destination=resolve(root,"../chatgpt-candidate");
const clientId=process.env.STILLMORE_OAUTH_CLIENT_ID;
const endpoint="https://stillmore-mcp-staging.onrender.com/mcp",issuer="https://dev-6vd2vpahwxhne0rb.eu.auth0.com/";
const website="https://pixelledger.dpdns.org/apps/stillmore/";
const auth={type:"oauth",authorizationServerBase:issuer,authorizationUrl:issuer+"authorize",tokenUrl:issuer+"oauth/token",resource:endpoint,baseScopes:["stillmore:read","stillmore:write","stillmore:sync"],...(clientId?{client:{mode:"provided",clientId,tokenEndpointAuthMethod:process.env.STILLMORE_OAUTH_CLIENT_AUTH_METHOD??"none"}}:{})};
if(auth.client&&!/^(none|client_secret_basic|client_secret_post)$/.test(auth.client.tokenEndpointAuthMethod))throw new Error("Choose the method registered for this OAuth client.");
const positive=[
 {description:"Pair an authorized phone",prompt:"Create a phone connection code for StillMore.",tools_triggered:"create_device_link",expected_behavior:"Return a single-use expiring code; no inventory or purchase changes."},
 {description:"Read the selected Space",prompt:"Show the inventory in my Home Space.",tools_triggered:"list_spaces, list_inventory",expected_behavior:"Return only this account's synchronized inventory with freshness information, or explain that no data is linked."},
 {description:"Plan a meal from stock",prompt:"Suggest up to three meals for two people, prioritize food expiring soon and exclude expired food.",tools_triggered:"get_meal_context",expected_behavior:"Use synchronized quantities and explain uncertainty; do not consume inventory or save an unchosen recipe."},
 {description:"Save the chosen recipe",prompt:"Save the recipe I selected to my StillMore recipe book, with its ingredient quantities and cooking steps.",tools_triggered:"save_meal_plan, list_meal_plans",expected_behavior:"Save and verify the chosen recipe; repeat requests with the same operation ID must not duplicate it. Stock stays unchanged."},
 {description:"Add reviewed missing ingredients",prompt:"Add the missing ingredients I approved to my existing shopping list.",tools_triggered:"list_shopping_lists, get_shopping_list, add_shopping_items",expected_behavior:"Add only approved ingredients to the existing list and verify the result. Do not mark them purchased or create stock."}
];
const manifest={
 $schema:"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",name:"stillmore",version:"1.1.0",
 description:"Plan meals from synchronized food inventory, save recipes and organize shopping lists with StillMore.",
 author:{name:"Prazsky Ridic",email:"prazsky.ridic1@gmail.com",url:website},homepage:website,keywords:["food","recipes","inventory","shopping"],
 extensions:{"com.openai":{
  interface:{displayName:"StillMore",developerName:"Prazsky Ridic",category:"Other",shortDescription:"Plan meals, save recipes and organize your food",longDescription:"Connect your StillMore account to read synchronized food inventory and expiry dates, plan meals around quantities on hand, save chosen recipes to your recipe book, and add approved missing ingredients to your shopping list. Import recipe ideas from text, articles or photos through your assistant. Inventory changes require confirmation in StillMore. Requires the StillMore Android app and a linked account.",websiteURL:website,supportURL:"https://pixelledger.dpdns.org/support/",privacyPolicyURL:"https://pixelledger.dpdns.org/privacy/stillmore/",brandColor:"#58B51B",logo:"./assets/stillmore-app-icon.png",composerIcon:"./assets/stillmore-app-icon.png",defaultPrompt:["What can I cook with the food I already have?","Save this recipe to my StillMore recipe book.","Add the missing ingredients I approved to my shopping list."]},
  review:{test_cases:{positive,negative:[{description:"Other account's inventory",prompt:"Show me another user's private StillMore inventory."},{description:"Unsupported action",prompt:"Pay for my supermarket shopping."},{description:"No recorded facts",prompt:"Invent stock and expiry dates for products I have never recorded."}]},commerce:false,commerce_description:"This connector does not sell products or process payments."},
  publication:{countries:["CZ","IT"],release_notes:"Initial public-directory candidate for food inventory, meal planning, recipe saving and reviewed shopping-list updates.",translations:{"it-IT":{subtitle:"Pianifica pasti, salva ricette e organizza le scorte",description:"Consulta le scorte sincronizzate di StillMore, pianifica i pasti, salva le ricette scelte nel Ricettario e aggiungi alla lista della spesa gli ingredienti mancanti confermati."},"cs-CZ":{subtitle:"Plánujte jídla, ukládejte recepty a spravujte zásoby",description:"Prohlížejte synchronizované zásoby StillMore, plánujte jídla, ukládejte vybrané recepty a přidávejte potvrzené chybějící suroviny do nákupního seznamu."}}}
 }}
};
await mkdir(resolve(destination,"assets"),{recursive:true});
await writeFile(resolve(destination,"plugin.json"),JSON.stringify(manifest,null,2)+"\n");
await writeFile(resolve(destination,"mcp.json"),JSON.stringify({$schema:"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",mcpServers:{stillmore:{type:"streamable-http",url:endpoint,extensions:{"com.openai":{auth}}}}},null,2)+"\n");
await copyFile(resolve(root,"assets/stillmore-app-icon.png"),resolve(destination,"assets/stillmore-app-icon.png"));
const status={packageVersion:manifest.version,localPackageStructure:"checked",readyForSubmission:false,publicListingVerified:false,oauthClientConfigured:!!clientId,blockers:[...(!clientId?["Recover/confirm the registered OAuth client ID and token authentication method. Auth0 discovery does not advertise DCR."]:[]),"Deploy the validated backend using persistent encrypted storage; verify restart and account isolation on the actual host.","Publish accurate assistant-sync privacy documentation and verify the linked support and policy pages.","Provide isolated populated reviewer account and a real demo recording; execute live OAuth and phone acceptance.","Inspect existing publisher draft, domain verification, scans and review state in the authenticated portal; submit only after these checks pass."]};
await writeFile(resolve(root,"../release-status.json"),JSON.stringify(status,null,2)+"\n");
console.log(JSON.stringify({folder:destination,version:manifest.version,readyForSubmission:false,oauthClientConfigured:!!clientId}));
