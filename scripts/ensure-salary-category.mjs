import {connectDb} from "../src/lib/db.js";
import {ExpenseCategory} from "../src/models/index.js";

try {
  await connectDb();
  const category=await ExpenseCategory.findOne({name:{$regex:/^salary$/i}});
  if(category){
    if(!category.active){
      category.active=true;
      await category.save();
      console.log("Salary category activated.");
    }else{
      console.log("Salary category already exists and is active.");
    }
  }else{
    await ExpenseCategory.create({name:"Salary",description:"Employee salary payments",type:"MANUAL",active:true});
    console.log("Salary category created.");
  }
}finally{
  await ExpenseCategory.db.close();
}
