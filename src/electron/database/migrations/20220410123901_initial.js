const knex = require('knex');

module.exports = {
	up: async knex => {
		return knex.schema
			.createTable('connections', table => {
				table.increments();
				table.string('name');
				table.string('ssh_user');
				table.string('ssh_host');
				table.string('mysql_user');
				table.string('mysql_password');
				table.string('mysql_port');
				table.integer('favorite');
			})
			.createTable('tunnels', table => {
				table.increments();
				table.integer('connection').references('id').inTable('connections');
				table.integer('port');
			})
	},
	down: async knex => {
		return knex.schema.dropTable('connections');
	}
}