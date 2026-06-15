package model

import (
	"errors"
	"fmt"

	"one-mcp/backend/common"

	"github.com/burugo/thing"
)

// UserConfig represents a user's configuration for a specific service setting
type UserConfig struct {
	thing.BaseModel
	UserID    int64  `db:"user_id,index:idx_user_config"`
	ServiceID int64  `db:"service_id,index:idx_user_config"`
	ConfigID  int64  `db:"config_id,index:idx_user_config"`
	Value     string `db:"value"`
}

// TableName sets the table name for the UserConfig model
func (c *UserConfig) TableName() string {
	return "user_configs"
}

var UserConfigDB *thing.Thing[*UserConfig]

// UserConfigInit initializes the UserConfigDB
func UserConfigInit() error {
	var err error
	UserConfigDB, err = thing.Use[*UserConfig]()
	if err != nil {
		return err
	}
	return nil
}

// GetUserConfigsForUser returns all config values for a specific user
func GetUserConfigsForUser(userID int64) ([]*UserConfig, error) {
	return UserConfigDB.Where("user_id = ?", userID).All()
}

// GetUserConfigsForService returns all config values for a specific user and service
func GetUserConfigsForService(userID, serviceID int64) ([]*UserConfig, error) {
	return UserConfigDB.Where("user_id = ? AND service_id = ?", userID, serviceID).All()
}

// GetUserConfigValue returns a specific config value for a user
func GetUserConfigValue(userID, configID int64) (*UserConfig, error) {
	configs, err := UserConfigDB.Where("user_id = ? AND config_id = ?", userID, configID).Fetch(0, 1)
	if err != nil {
		return nil, err
	}
	if len(configs) == 0 {
		return nil, errors.New("user_config_not_found")
	}
	return configs[0], nil
}

// SaveUserConfig creates or updates a user config value
func SaveUserConfig(config *UserConfig) error {
	// Check if record exists
	existingConfigs, err := UserConfigDB.Where("user_id = ? AND config_id = ?", config.UserID, config.ConfigID).Fetch(0, 1)
	if err != nil {
		return err
	}

	if len(existingConfigs) > 0 {
		// Update existing record
		existing := existingConfigs[0]
		existing.Value = config.Value
		return UserConfigDB.Save(existing)
	}

	// Create new record
	return UserConfigDB.Save(config)
}

// DeleteUserConfig deletes a specific user config
func DeleteUserConfig(userID, configID int64) error {
	configs, err := UserConfigDB.Where("user_id = ? AND config_id = ?", userID, configID).All()
	if err != nil {
		return err
	}

	for _, config := range configs {
		if err := UserConfigDB.Delete(config); err != nil {
			return err
		}
	}

	return nil
}

// DeleteUserConfigsForService deletes all user configs for a specific service
func DeleteUserConfigsForService(userID, serviceID int64) error {
	configs, err := UserConfigDB.Where("user_id = ? AND service_id = ?", userID, serviceID).All()
	if err != nil {
		return err
	}

	for _, config := range configs {
		if err := UserConfigDB.Delete(config); err != nil {
			return err
		}
	}

	return nil
}

// GetUserConfigsWithDetails returns user configs with service and config details
func GetUserConfigsWithDetails(userID int64) ([]map[string]interface{}, error) {
	configs, err := UserConfigDB.Where("user_id = ?", userID).All()
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, 0, len(configs))

	for _, config := range configs {
		service, err := MCPServiceDB.ByID(config.ServiceID)
		if err != nil {
			continue
		}

		configService, err := ConfigServiceDB.ByID(config.ConfigID)
		if err != nil {
			continue
		}

		configMap := map[string]interface{}{
			"id":         config.ID,
			"user_id":    config.UserID,
			"service":    service,
			"config":     configService,
			"value":      config.Value,
			"created_at": config.CreatedAt,
			"updated_at": config.UpdatedAt,
		}

		result = append(result, configMap)
	}

	return result, nil
}

// GetUserSpecificEnvs retrieves a map of environment variable key-value pairs
// for a specific user and service.
// It reads from ~/.aek/mcp/settings.jsonc, keyed by service name.
// The userID parameter is kept for API compatibility but is no longer used for config lookup.
func GetUserSpecificEnvs(userID int64, mcpServiceID int64) (map[string]string, error) {
	// Look up service name from mcpServiceID
	service, err := GetServiceByID(mcpServiceID)
	if err != nil {
		common.SysError(fmt.Sprintf("GetUserSpecificEnvs: failed to get service by ID %d: %v. Falling back to empty config.", mcpServiceID, err))
		return make(map[string]string), nil
	}

	envMap, err := common.GetServiceEnvsFromSettingsByName(service.Name)
	if err != nil {
		common.SysError(fmt.Sprintf("GetUserSpecificEnvs: error reading settings.jsonc for service %s: %v", service.Name, err))
		return make(map[string]string), nil
	}

	return envMap, nil
}
