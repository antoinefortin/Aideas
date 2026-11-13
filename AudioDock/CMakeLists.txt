cmake_minimum_required(VERSION 3.24)
project(AudioDock LANGUAGES NONE)

# WPF is compiled by the .NET SDK. CMake provides build/publish/run targets.
if(NOT WIN32)
  message(FATAL_ERROR "AudioDock requires Windows (WPF).")
endif()
find_program(DOTNET_EXECUTABLE NAMES dotnet REQUIRED)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug CACHE STRING "Debug or Release" FORCE)
endif()
set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS Debug Release)
set(AUDIODOCK_PROJECT "${CMAKE_CURRENT_SOURCE_DIR}/AudioDock.csproj")
set(AUDIODOCK_OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/app")
set(AUDIODOCK_PUBLISH "${CMAKE_CURRENT_BINARY_DIR}/publish")

add_custom_target(AudioDock ALL
  COMMAND "${DOTNET_EXECUTABLE}" build "${AUDIODOCK_PROJECT}"
    --configuration "${CMAKE_BUILD_TYPE}" --output "${AUDIODOCK_OUTPUT}"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  COMMENT "Building AudioDock (${CMAKE_BUILD_TYPE})"
  VERBATIM USES_TERMINAL)

add_custom_target(publish
  COMMAND "${DOTNET_EXECUTABLE}" publish "${AUDIODOCK_PROJECT}"
    --configuration "${CMAKE_BUILD_TYPE}" --output "${AUDIODOCK_PUBLISH}"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  COMMENT "Publishing AudioDock to ${AUDIODOCK_PUBLISH}"
  VERBATIM USES_TERMINAL)

add_custom_target(run
  COMMAND "${DOTNET_EXECUTABLE}" "${AUDIODOCK_OUTPUT}/AudioDock.dll"
  DEPENDS AudioDock
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  COMMENT "Launching AudioDock"
  VERBATIM USES_TERMINAL)
