import mongoose from 'mongoose'
const { Schema } = mongoose;

const dbConfigSchema = new Schema({
    dbname:{
        type:String
    },
    config:{
        type:Array
    }
},{ timestamps: true })

const dbConfigStr = mongoose.model('dbconfigStr',dbConfigSchema);

export{
    dbConfigStr
}