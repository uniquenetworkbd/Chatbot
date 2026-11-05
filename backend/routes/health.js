const express=require("express"),{controllers}=require("../controllers/api-controllers");module.exports=deps=>{const r=express.Router(),c=controllers(deps);r.get("/",c.health);return r;};
