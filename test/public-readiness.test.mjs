import test from "node:test";
import assert from "node:assert/strict";
import {DeviceLinkService} from "../src/device-links.mjs";
import {toolDefinitions} from "../src/domain.mjs";
test("phone pairing cannot escalate read-only OAuth permissions",()=>{assert.throws(()=>new DeviceLinkService().create({userId:"read-only-user",scopes:["stillmore:read"]}),e=>e.code==="forbidden");});
test("all discoverable tools expose human-readable titles and action annotations",()=>{for(const tool of toolDefinitions){assert.ok(tool.title?.trim(),tool.name);assert.equal(typeof tool.annotations.readOnlyHint,"boolean");assert.equal(typeof tool.annotations.destructiveHint,"boolean");}});
