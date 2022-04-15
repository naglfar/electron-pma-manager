const knex = require('knex');

module.exports = {
	up: async knex => {
		return knex.schema
			.createTable('settings', table => {
				table.increments();
				table.string('key');
				table.string('value');
				table.unique('key');
			});
	},
	down: async knex => {
		return knex.schema.dropTable('settings');
	}
}
