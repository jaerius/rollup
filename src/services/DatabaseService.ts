import { Level } from 'level';

class DatabaseService {
    private db: Level;

    constructor(dbPath: string) {
        this.db = new Level(dbPath);
    }

    async put(key: string, value: string): Promise<void> {
        await this.db.put(key, value);
    }

    async get(key: string): Promise<string> {
        return await this.db.get(key);
    }
}

export default DatabaseService;
