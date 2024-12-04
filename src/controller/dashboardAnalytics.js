import { fetchDbDetails } from './createdb.js'
import { queryExecuter } from "../clientDB/connectClientDb.js"
import { dashboardAnalytics } from "../models/dashboardAnalytics.js"
import mongoose from 'mongoose';
const ObjectId = mongoose.Types.ObjectId;


async function saveDashboardAnalyticsData(req, res) {
    try {
        const userId = new ObjectId(req.token)
        const { database, query, title } = req.body;
        // Validate required parameters
        if (!database || !query ||!title) {
            return res.status(400).json({ status: false, message: 'Mandatory parameters missing' });
        }

        const dbDetail = await fetchDbDetails({userId:userId,database:database})
        if(!dbDetail.config){
          res.status(500).send({ error: 'Server error', message: dbDetail.message });
        }

        const sql_result = await queryExecuter(dbDetail, query);

        if(sql_result && sql_result.length > 0){
            const newRecord = new dashboardAnalytics({ userId, database: new ObjectId(dbDetail._id), title, query });
            await newRecord.save();
            res.status(201).send({ status: true, message: "Dashboard Analyst created successfully", data: sql_result, title:title });
        }else{
            res.status(400).json({ status:true , message: 'No data found for this query', error: sql_result.message });
        }
    } catch (err) {
        console.log(err)
        res.status(500).json({ status:false, message: 'Error creating Dashboard Analyst', error: err.message });
    }
}

async function getDashboardAnalyticsData(req,res) {
    try {
        const userId = new ObjectId(req.token)
        const { database } = req.body;

        const dbDetail = await fetchDbDetails({userId:userId,database:database})
        if(!dbDetail.config){
          res.status(500).send({ error: 'Server error', message: dbDetail.message });
        }

        const records = await dashboardAnalytics.find({ userId, database: new ObjectId(dbDetail._id)}) 
        
        const data = await Promise.all(
            records.map(async (record) => {
                const query = record.query;
    
                const sql_result = await queryExecuter(dbDetail, query);
    
                return {
                    ...record.toObject(), 
                    data:sql_result, 
                };
            })
        );
        res.status(200).json({ message: 'Fetched data successfully', data: data });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching Dashboard Analysts', error: err.message });
    }
}

async function getDashboardAnalyticsDataById(req,res) {
    try {
        const { id,database } = req.query;
        const userId = new ObjectId(req.token)

        const dbDetail = await fetchDbDetails({userId:userId,database:database})
        if(!dbDetail.config){
          res.status(500).send({ error: 'Server error', message: dbDetail.message });
        }

        const records = await dashboardAnalytics.findOne({_id:id}) 
        if(!records){
            return res.status(400).json({ status:true , message: 'No data found for this Graph' });
        }
        
        const sql_result = await queryExecuter(dbDetail, records.query);

        res.status(200).json({ message: 'Fetched data successfully', data: sql_result });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching Dashboard Analysts', error: err.message });
    }
}

async function updateDashboardAnalyticsData(req,res) {
    try {
        const { id } = req.params;
        const userId = new ObjectId(req.token)
        const { database, title, query } = req.body;

        const dbDetail = await fetchDbDetails({userId:userId,database:database})
        if(!dbDetail.config){
          res.status(500).send({ error: 'Server error', message: dbDetail.message });
        }

        const sql_result = await queryExecuter(dbDetail, query);
        if(sql_result && sql_result.length > 0){
            const updatedRecord = await dashboardAnalytics.findByIdAndUpdate(
                id,
                { userId, database: new ObjectId(dbDetail._id), title, query },
                { new: true, runValidators: true }
            );
    
            if (!updatedRecord) {
                return res.status(404).json({ message: 'Dashboard Analyst document not found' });
            }
            res.status(201).send({ status: true, message: "Dashboard Analyst created successfully", data: sql_result, title:title });
        }else{
            res.status(400).json({ status:true , message: 'No data found for this query', error: sql_result.message });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error updating Dashboard Analyst', error: error.message });
    }
}

async function deleteDashboardAnalyticsData(req,res) {
    try {
        const { id } = req.params;

        const deletedRecord = await dashboardAnalytics.findByIdAndDelete(id);

        if (!deletedRecord) {
            return res.status(404).json({ message: 'Dashboard Analyst not found' });
        }

        res.status(200).json({ message: 'Dashboard Analyst deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting Dashboard Analyst', error: error.message });
    }
}

export {
    saveDashboardAnalyticsData,
    getDashboardAnalyticsData,
    updateDashboardAnalyticsData,
    deleteDashboardAnalyticsData,
    getDashboardAnalyticsDataById
}