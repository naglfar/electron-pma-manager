module.exports = {
	up: async knex => {
		return knex.schema
			.alterTable('connections', table => {
				// with ssh as seen from the ssh server, else connected directly; empty is 127.0.0.1
				table.string('mysql_host');
			});
	},
	down: async knex => {
		return knex.schema
			.alterTable('connections', table => {
				table.dropColumn('mysql_host');
			});
	}
}
