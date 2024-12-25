import mongoose from 'mongoose'
const { Schema } = mongoose;

const dashboardAnalyticsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    database:{
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'DatabaseCredentials'
    },
    title:{
        type:String,
        required:true
    },
    query:{
        type:String,
        required:true
    },
    graphoption:{
        type:Object,
    },
    type: {
        type:String,
        required:true
    }
},{ timestamps: true })

const dashboardAnalytics = mongoose.model('DashboardAnalyticss',dashboardAnalyticsSchema);

export{
    dashboardAnalytics
}