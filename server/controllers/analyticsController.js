import { AnalyticsModel } from '../models/Postgres/analytics.js';

export class AnalyticsController {
    async getDashboard(req, res) {
        try {
            const result = await AnalyticsModel.getDashboard(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getFilters(req, res) {
        try {
            const result = await AnalyticsModel.getFilters(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSummary(req, res) {
        try {
            const result = await AnalyticsModel.getSummary(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSeries(req, res) {
        try {
            const result = await AnalyticsModel.getSeries(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getTimeseries(req, res) {
        try {
            const result = await AnalyticsModel.getTimeSeries(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }



    async getBusinessLines(req, res) {
        try {
            const result = await AnalyticsModel.getBusinessLines(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBusinessUnits(req, res) {
        try {
            const result = await AnalyticsModel.getBusinessUnits(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getTop(req, res) {
        try {
            const result = await AnalyticsModel.getTop(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getInvoices(req, res) {
        try {
            const result = await AnalyticsModel.getInvoices(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDataQuality(req, res) {
        try {
            const result = await AnalyticsModel.getDataQuality(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getCompliance(req, res) {
        try {
            const result = await AnalyticsModel.getCompliance(req.query);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
